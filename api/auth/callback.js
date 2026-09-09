/**
 * 飞书 OAuth 授权回调接口
 * 飞书授权后跳转到这里，带 code 参数
 * 流程：验证 state -> 用 code 换用户信息 -> 验证白名单 -> 设置登录 cookie -> 跳回首页
 */

const { parseCookies, getUserInfoByCode, isUserAllowed, buildSessionCookieValue, buildClearStateCookieValue } = require('../_utils');

module.exports = async (req, res) => {
    try {
          const { code, state } = req.query;

      // 1. 验证 code 是否存在
      if (!code) {
              throw new Error('缺少授权码 code');
      }

      // 2. 验证 state（防止 CSRF 攻击）
      const cookies = parseCookies(req);
          const savedState = cookies.oauth_state;
          if (!savedState || savedState !== state) {
                  throw new Error('state 验证失败，可能是 CSRF 攻击');
          }

      // 3. 用 code 换取用户信息
      const userInfo = await getUserInfoByCode(code);
          console.log('用户登录成功:', userInfo.name, userInfo.open_id);

      // 4. 验证白名单
      if (!isUserAllowed(userInfo.open_id)) {
              // 不在白名单，显示无权限页面
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.status(403).send(`
                      <!DOCTYPE html>
                              <html>
                                      <head>
                                                <meta charset="UTF-8">
                                                          <title>无访问权限</title>
                                                                    <style>
                                                                                body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f7f8fa; }
                                                                                            .box { text-align: center; padding: 40px; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
                                                                                                        h1 { color: #f53f3f; margin-bottom: 12px; }
                                                                                                                    p { color: #646a73; margin-bottom: 24px; }
                                                                                                                                .open-id { font-size: 12px; color: #8f959e; background: #f7f8fa; padding: 8px 12px; border-radius: 6px; margin-top: 16px; word-break: break-all; }
                                                                                                                                            a { color: #3370ff; text-decoration: none; }
                                                                                                                                                      </style>
                                                                                                                                                              </head>
                                                                                                                                                                      <body>
                                                                                                                                                                                <div class="box">
                                                                                                                                                                                            <h1>无访问权限</h1>
                                                                                                                                                                                                        <p>抱歉，您的飞书账号不在白名单中，无法访问此页面。</p>
                                                                                                                                                                                                                    <p>您的姓名：${userInfo.name}</p>
                                                                                                                                                                                                                                <div class="open-id">您的 open_id：${userInfo.open_id}<br>（如需访问，请将此 open_id 告知管理员加入白名单）</div>
                                                                                                                                                                                                                                          </div>
                                                                                                                                                                                                                                                  </body>
                                                                                                                                                                                                                                                          </html>
                                                                                                                                                                                                                                                                `);
              return;
      }

      // 5. 一次性设置两个 cookie：登录 cookie + 清除 oauth_state
      // 注意：多个 Set-Cookie 必须用数组一次性发送，分两次 setHeader 会互相覆盖
      const sessionCookie = buildSessionCookieValue(userInfo.open_id);
          const clearStateCookie = buildClearStateCookieValue();

      // 6. 跳回首页（Location 和 Set-Cookie 在 writeHead 里一次性发送）
      res.writeHead(302, {
              Location: '/',
              'Set-Cookie': [sessionCookie, clearStateCookie],
      });
          res.end();
    } catch (error) {
          console.error('授权回调失败:', error);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.status(500).send(`
                <!DOCTYPE html>
                      <html>
                            <head>
                                    <meta charset="UTF-8">
                                            <title>登录失败</title>
                                                    <style>
                                                              body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f7f8fa; }
                                                                        .box { text-align: center; padding: 40px; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
                                                                                  h1 { color: #f53f3f; margin-bottom: 12px; }
                                                                                            p { color: #646a73; margin-bottom: 24px; }
                                                                                                      a { color: #3370ff; text-decoration: none; padding: 10px 20px; background: #3370ff; color: #fff; border-radius: 8px; display: inline-block; }
                                                                                                              </style>
                                                                                                                    </head>
                                                                                                                          <body>
                                                                                                                                  <div class="box">
                                                                                                                                            <h1>登录失败</h1>
                                                                                                                                                      <p>${error.message}</p>
                                                                                                                                                                <a href="/">返回首页</a>
                                                                                                                                                                        </div>
                                                                                                                                                                              </body>
                                                                                                                                                                                    </html>
                                                                                                                                                                                        `);
    }
};
