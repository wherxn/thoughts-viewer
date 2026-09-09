/**
 * 登录接口：生成飞书 OAuth 授权 URL，重定向到飞书授权页面
 */

const crypto = require('crypto');
const { getFeishuAuthUrl } = require('../_utils');

module.exports = async (req, res) => {
  try {
    // 生成随机 state，用于防止 CSRF 攻击
    const state = crypto.randomBytes(16).toString('hex');

    // state 暂时存在 cookie 里，回调时验证
    res.setHeader(
      'Set-Cookie',
      `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    );

    // 动态获取当前域名，构造回调地址（适配不同域名访问）
    const host = req.headers.host;
    const redirectUri = `https://${host}/api/auth/callback`;
    console.log('登录回调地址:', redirectUri);

    // 生成飞书授权 URL 并重定向
    const authUrl = getFeishuAuthUrl(state, redirectUri);
    res.writeHead(302, { Location: authUrl });
    res.end();
  } catch (error) {
    console.error('登录跳转失败:', error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
