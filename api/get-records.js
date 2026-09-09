/**
 * 获取想法记录表的所有记录
 * 分页获取（飞书 API 单次最多 100 条），然后合并返回
 */

const { FEISHU_CONFIG, callFeishuApi } = require('./_utils');

module.exports = async (req, res) => {
  try {
    const allRecords = [];
    let pageToken = null;
    let hasMore = true;

    // 分页获取所有记录
    while (hasMore) {
      const path = `/bitable/v1/apps/${FEISHU_CONFIG.baseToken}/tables/${FEISHU_CONFIG.tableId}/records?page_size=100${pageToken ? `&page_token=${pageToken}` : ''}`;

      const data = await callFeishuApi(path, { method: 'GET' });

      if (data.data && data.data.items) {
        allRecords.push(...data.data.items);
      }

      hasMore = data.data && data.data.has_more;
      pageToken = data.data && data.data.page_token;
    }

    // 格式化记录，只返回前端需要的字段
    const formattedRecords = allRecords.map((record) => {
      const fields = record.fields || {};

      // 处理附件字段（飞书返回的是数组，每个元素包含 file_token, name, size 等）
      const attachments = Array.isArray(fields['附件'])
        ? fields['附件'].map((file) => ({
            file_token: file.file_token,
            name: file.name,
            size: file.size,
            type: file.type || '',
          }))
        : [];

      // 处理创建时间（飞书 created_at 字段返回的是时间戳字符串，如 "2026-09-02T23:15:28.000+08:00"）
      let createdTime = '';
      if (fields['创建时间']) {
        try {
          const date = new Date(fields['创建时间']);
          createdTime = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
        } catch (e) {
          createdTime = fields['创建时间'];
        }
      }

      return {
        record_id: record.record_id,
        title: fields['标题'] || '',
        content: fields['内容'] || '',
        category1: fields['一级分类'] || '',
        category2: fields['二级分类'] || '',
        category3: fields['三级分类'] || '',
        favorite: fields['收藏标注'] || '',
        attachments: attachments,
        created_time: createdTime,
      };
    });

    // 设置响应头，允许跨域（前端从不同域名访问时需要）
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    res.status(200).json({
      success: true,
      total: formattedRecords.length,
      data: formattedRecords,
    });
  } catch (error) {
    console.error('获取记录失败:', error);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
