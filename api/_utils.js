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

module.exports = {
  FEISHU_CONFIG,
  getTenantAccessToken,
  callFeishuApi,
};
