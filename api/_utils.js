/**
 * 飞书 API 共享工具函数
 * 包含：获取 tenant_access_token、飞书 API 基础配置、登录态管理
 */

const fetch = require('node-fetch');
const crypto = require('crypto');

// ========== 飞书应用配置 ==========
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_aa2a72b9d1799cc4';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const FEISHU_BASE_TOKEN = process.env.FEISHU_BASE_TOKEN || 'WfIrbiQAYaITeSsR5uGcmnjHnCb';
const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID || 'tblQwBZZyVeCrY2A';

// 兼容旧代码的配置对象（get-records.js 等旧文件引用 FEISHU_CONFIG.baseToken）
const FEISHU_CONFIG = {
  baseToken: FEISHU_BASE_TOKEN,
  tableId: FEISHU_TABLE_ID,
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
};

// 允许访问的用户白名单（open_id 列表，逗号分隔）
// 为空时允许所有飞书用户登录
const ALLOWED_USER_IDS = (process.env.ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// ========== tenant_access_token 缓存 ==========
let cachedToken = null;
let tokenExpireTime = 0;

async function getTenantAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpireTime) {
    return cachedToken;
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET,
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error('获取 tenant_access_token 失败: ' + data.msg);
  }

  cachedToken = data.tenant_access_token;
  tokenExpireTime = now + (data.expire - 60) * 1000;
  return cachedToken;
}

// ========== 飞书 API 通用调用 ==========
async function callFeishuApi(url, options = {}) {
  const token = await getTenantAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return response.json();
}

// ========== Cookie 解析 ==========
function parseCookies(req) {
  const cookies = {};
  const cookieHeader = req.headers.cookie || '';
  cookieHeader.split(';').forEach(pair => {
    const [name, ...valueParts] = pair.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(valueParts.join('='));
    }
  });
  return cookies;
}

// ========== 登录态 Token（HMAC 签名） ==========
const SESSION_COOKIE_NAME = 'thoughts_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

function createSessionToken(openId) {
  const expire = Date.now() + SESSION_DURATION;
  const payload = Buffer.from(JSON.stringify({ openId, expire })).toString('base64');
  const signature = crypto.createHmac('sha256', FEISHU_APP_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expectedSignature = crypto.createHmac('sha256', FEISHU_APP_SECRET).update(payload).digest('hex');
  if (signature !== expectedSignature) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    if (Date.now() > data.expire) return null;
    return data;
  } catch {
    return null;
  }
}

// ========== Cookie 构造函数（新增，用于一次性发送多个 Set-Cookie） ==========
function buildSessionCookieValue(openId) {
  const token = createSessionToken(openId);
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION / 1000}`;
}

function buildClearStateCookieValue() {
  return 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

// ========== 设置/清除 Cookie（旧函数，保留兼容） ==========
function setSessionCookie(res, openId) {
  const cookieValue = buildSessionCookieValue(openId);
  res.setHeader('Set-Cookie', cookieValue);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

// ========== 获取当前登录用户 ==========
function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  const session = verifySessionToken(token);
  return session ? { open_id: session.openId } : null;
}

// ========== 白名单验证 ==========
function isUserAllowed(openId) {
  if (ALLOWED_USER_IDS.length === 0) return true;
  return ALLOWED_USER_IDS.includes(openId);
}

// ========== 飞书 OAuth 授权 URL 构造 ==========
function getFeishuAuthUrl(state, redirectUri) {
  const params = new URLSearchParams({
    app_id: FEISHU_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state,
  });
  return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
}

// ========== 用 code 换取用户信息 ==========
async function getUserInfoByCode(code) {
  const tokenResponse = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await getTenantAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: code,
    }),
  });

  const tokenData = await tokenResponse.json();
  console.log('飞书 token 接口返回:', JSON.stringify(tokenData).substring(0, 500));

  if (tokenData.code !== 0) {
    throw new Error('换取 user_access_token 失败: ' + tokenData.msg);
  }

  const userAccessToken = tokenData.data.access_token;

  const userResponse = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${userAccessToken}`,
    },
  });

  const userData = await userResponse.json();
  console.log('飞书 user_info 接口返回:', JSON.stringify(userData).substring(0, 500));

  if (userData.code !== 0) {
    throw new Error('获取用户信息失败: ' + userData.msg);
  }

  return {
    open_id: userData.data.open_id,
    name: userData.data.name,
    avatar: userData.data.avatar_url,
  };
}

module.exports = {
  FEISHU_APP_ID,
  FEISHU_APP_SECRET,
  FEISHU_BASE_TOKEN,
  FEISHU_TABLE_ID,
  FEISHU_CONFIG,
  getTenantAccessToken,
  callFeishuApi,
  parseCookies,
  createSessionToken,
  verifySessionToken,
  setSessionCookie,
  clearSessionCookie,
  buildSessionCookieValue,
  buildClearStateCookieValue,
  getCurrentUser,
  isUserAllowed,
  getFeishuAuthUrl,
  getUserInfoByCode,
};
