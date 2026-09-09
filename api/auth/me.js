/**
 * 获取当前登录用户信息
 * 前端调用此接口检查是否已登录
 */

const { getCurrentUser } = require('../_utils');

module.exports = async (req, res) => {
  try {
    const user = getCurrentUser(req);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (!user) {
      res.status(200).json({
        success: true,
        loggedIn: false,
        user: null,
      });
      return;
    }

    res.status(200).json({
      success: true,
      loggedIn: true,
      user: {
        open_id: user.openId,
      },
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
