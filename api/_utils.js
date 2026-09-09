/**
 * 飞书 API 共享工具函数
 * 包含：获取 tenant_access_token、飞书 API 基础配置
 */

const fetch = require('node-fetch');

// 飞书多维表格配置（从环境变量读取，避免硬编码敏感信息）
const FEISHU_CONFIG = {
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  baseToken: process.env.FEISHU_BASE_TOKEN || 'WfIrbiQAYaITeSsR5uGcmnjHnCb',
  tableId: process.env.FEISHU_TABLE_ID || 'tblQwBZZyVeCrY2A',
};

// token 缓存（避免每次请求都重新获取 token）
let tokenCache = {
  token: null,
  expireTime: 0,
};

/**
 * 获取 tenant_access_token（应用身份访问令牌）
 * token 有效期 2 小时，缓存起来避免重复请求
 */
async function getTenantAccessToken() {
  const now = Date.now();

  // 如果 token 还在有效期内，直接返回缓存
  if (tokenCache.token && now < tokenCache.expireTime) {
    return tokenCache.token;
  }

  // 否则重新获取 token
  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: FEISHU_CONFIG.appId,
        app_secret: FEISHU_CONFIG.appSecret,
      }),
    }
  );

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`获取飞书 token 失败: ${data.msg} (code: ${data.code})`);
  }

  // 缓存 token，提前 5 分钟过期（避免边界情况）
  tokenCache = {
    token: data.tenant_access_token,
    expireTime: now + (data.expire - 300) * 1000,
  };

  return tokenCache.token;
}

/**
 * 调用飞书 API 的通用函数
 * @param {string} path - API 路径（如 /bitable/v1/apps/xxx/tables/xxx/records）
 * @param {object} options - fetch 选项
 */
async function callFeishuApi(path, options = {}) {
  const token = await getTenantAccessToken();

  const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`飞书 API 调用失败: ${data.msg} (code: ${data.code}, path: ${path})`);
  }

  return data;
}

// ============================================================
// 登录态相关工具函数
// ============================================================

const crypto = require('crypto');
const SESSION_COOKIE_NAME = 'thoughts_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7天

/**
 * 从请求头解析 cookie
 * @param {object} req - Vercel 请求对象
 * @returns {object} cookie 键值对
 */
function parseCookies(req) {
  const cookies = {};
  const cookieHeader = req.headers.cookie || '';
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((pair) => {
    const [key, ...valueParts] = pair.trim().split('=');
    if (key) {
      cookies[key.trim()] = decodeURIComponent(valueParts.join('='));
    }
  });

  return cookies;
}

/**
 * 生成登录 session token
 * 格式：base64(open_id).base64(expire_time).hmac_signature
 * 用 App Secret 作为签名密钥，防止篡改
 * @param {string} openId - 飞书用户 open_id
 * @returns {string} 签名后的 token
 */
function createSessionToken(openId) {
  const expireTime = Date.now() + SESSION_DURATION_MS;
  const payload = `${Buffer.from(openId).toString('base64')}.${Buffer.from(String(expireTime)).toString('base64')}`;
  const signature = crypto
    .createHmac('sha256', FEISHU_CONFIG.appSecret)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${payload}.${signature}`;
}

/**
 * 验证登录 session token
 * @param {string} token - 待验证的 token
 * @returns {object|null} 验证通过返回 { openId, expireTime }，失败返回 null
 */
function verifySessionToken(token) {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [openIdB64, expireTimeB64, signature] = parts;
  const payload = `${openIdB64}.${expireTimeB64}`;

  // 验证签名
  const expectedSignature = crypto
    .createHmac('sha256', FEISHU_CONFIG.appSecret)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  if (signature !== expectedSignature) return null;

  // 验证过期时间
  const openId = Buffer.from(openIdB64, 'base64').toString();
  const expireTime = parseInt(Buffer.from(expireTimeB64, 'base64').toString(), 10);

  if (Date.now() > expireTime) return null;

  return { openId, expireTime };
}

/**
 * 设置登录 session cookie
 * @param {object} res - Vercel 响应对象
 * @param {string} openId - 飞书用户 open_id
 */
function setSessionCookie(res, openId) {
  const token = createSessionToken(openId);
  const expires = new Date(Date.now() + SESSION_DURATION_MS).toUTCString();

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`
  );
}

/**
 * 清除登录 session cookie（登出用）
 * @param {object} res - Vercel 响应对象
 */
function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

/**
 * 从请求中获取当前登录用户
 * @param {object} req - Vercel 请求对象
 * @returns {object|null} 已登录返回 { openId }，未登录返回 null
 */
function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session) return null;

  return { openId: session.openId };
}

/**
 * 白名单验证
 * 从环境变量 ALLOWED_USER_IDS 读取允许的 open_id 列表，逗号分隔
 * 如果环境变量为空，允许所有用户（方便首次登录测试）
 * @param {string} openId - 待验证的 open_id
 * @returns {boolean} 是否允许
 */
function isUserAllowed(openId) {
  const allowedIds = process.env.ALLOWED_USER_IDS;
  if (!allowedIds || allowedIds.trim() === '') {
    return true; // 未配置白名单，允许所有
  }

  const idList = allowedIds.split(',').map((id) => id.trim());
  return idList.includes(openId);
}

/**
 * 生成飞书 OAuth 授权 URL
 * @param {string} state - 随机状态值，用于防止 CSRF
 * @param {string} redirectUri - 回调地址（动态传入，适配不同域名）
 * @returns {string} 授权 URL
 */
function getFeishuAuthUrl(state, redirectUri) {
  const params = new URLSearchParams({
    app_id: FEISHU_CONFIG.appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state,
  });
  return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
}

/**
 * 用授权码 code 换取用户信息
 * 流程：code -> user_access_token -> 用户信息
 * @param {string} code - 飞书返回的授权码
 * @returns {object} 用户信息 { open_id, name, avatar_url }
 */
async function getUserInfoByCode(code) {
  const tenantToken = await getTenantAccessToken();

  // 第1步：用 code 换取 user_access_token
  const tokenResponse = await fetch(
    'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
      }),
    }
  );

  const tokenData = await tokenResponse.json();
  if (tokenData.code !== 0) {
    throw new Error(`换取 user_access_token 失败: ${tokenData.msg} (code: ${tokenData.code})`);
  }

  const userAccessToken = tokenData.data.access_token;
  const openId = tokenData.data.open_id;

  // 第2步：用 user_access_token 获取用户信息
  const userResponse = await fetch(
    'https://open.feishu.cn/open-apis/authen/v1/user_info',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    }
  );

  const userData = await userResponse.json();
  if (userData.code !== 0) {
    throw new Error(`获取用户信息失败: ${userData.msg} (code: ${userData.code})`);
  }

  return {
    open_id: openId,
    name: userData.data.name,
    avatar_url: userData.data.avatar_url,
  };
}

module.exports = {
  FEISHU_CONFIG,
  getTenantAccessToken,
  callFeishuApi,
  // 登录态相关
  parseCookies,
  createSessionToken,
  verifySessionToken,
  setSessionCookie,
  clearSessionCookie,
  isUserAllowed,
  getUserInfoByCode,
  getFeishuAuthUrl,
};
