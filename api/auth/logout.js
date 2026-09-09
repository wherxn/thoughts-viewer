/**
 * 登出接口：清除登录 cookie，跳回首页
 */

const { clearSessionCookie } = require('../_utils');

module.exports = async (req, res) => {
  try {
    // 清除登录 cookie
    clearSessionCookie(res);

    // 跳回首页
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (error) {
    console.error('登出失败:', error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
