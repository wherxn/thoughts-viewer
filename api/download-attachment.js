/**
 * 直接下载附件（代理飞书下载接口）
 * 前端传来 file_token、record_id、field_id，后端调用飞书下载接口，把文件内容返回给前端
 * 注意：此接口会增加后端流量，但可以绕过 batch_get_tmp_download_url 返回空数据的问题
 */

const { callFeishuApi, getCurrentUser, FEISHU_TABLE_ID } = require('./_utils');

// 附件字段ID（想法记录表中的"附件"字段）
const ATTACHMENT_FIELD_ID = 'fld7LCCG4u';

module.exports = async (req, res) => {
  try {
    // 登录验证：未登录返回 401
    const user = getCurrentUser(req);
    if (!user) {
      res.status(401).json({
        success: false,
        error: '未登录，请先登录',
      });
      return;
    }

    // 从请求参数中获取 file_token
    let fileToken = '';
    let recordId = '';
    let fieldId = ATTACHMENT_FIELD_ID;
    let fileName = 'attachment';

    if (req.method === 'GET') {
      fileToken = req.query.file_token || '';
      recordId = req.query.record_id || '';
      fieldId = req.query.field_id || ATTACHMENT_FIELD_ID;
      fileName = req.query.file_name || 'attachment';
    } else if (req.method === 'POST') {
      fileToken = req.body.file_token || '';
      recordId = req.body.record_id || '';
      fieldId = req.body.field_id || ATTACHMENT_FIELD_ID;
      fileName = req.body.file_name || 'attachment';
    }

    if (!fileToken) {
      res.status(400).json({
        success: false,
        error: '缺少 file_token 参数',
      });
      return;
    }

    if (!recordId) {
      res.status(400).json({
        success: false,
        error: '缺少 record_id 参数',
      });
      return;
    }

    // 构建 extra 参数（多维表格附件鉴权必需）
    const attachmentsObj = {};
    attachmentsObj[fieldId] = {};
    attachmentsObj[fieldId][recordId] = [fileToken];

    const extraObj = {
      bitablePerm: {
        tableId: FEISHU_TABLE_ID,
        attachments: attachmentsObj,
      },
    };
    const extraBase64 = Buffer.from(JSON.stringify(extraObj)).toString('base64');

    // 获取 tenant_access_token
    const token = await getTenantAccessToken();

    // 调用飞书下载接口
    const downloadUrl = `https://open.feishu.cn/open-apis/drive/v1/medias/${fileToken}/download?extra=${encodeURIComponent(extraBase64)}`;

    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('飞书下载接口失败:', response.status, errorText);
      res.status(500).json({
        success: false,
        error: `飞书下载接口失败: ${response.status}`,
        detail: errorText.substring(0, 500),
      });
      return;
    }

    // 获取文件内容类型
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    // 设置响应头
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // 把飞书返回的文件内容流式传输给前端
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.status(200).end(buffer);

  } catch (error) {
    console.error('下载附件失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 获取 tenant_access_token（从 _utils.js 中获取）
 */
async function getTenantAccessToken() {
  // 直接调用 _utils.js 中的内部函数不太方便，这里重新实现
  // 实际上，callFeishuApi 内部已经处理了 token 获取
  // 但是下载接口需要直接用 fetch，所以这里单独获取 token
  
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });
  
  const data = await response.json();
  return data.tenant_access_token;
}
