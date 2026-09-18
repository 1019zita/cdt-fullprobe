# CDT Full-Probe

全探测（Full-Probe）变化觉察工作记忆实验的静态网页版本。

## 在线运行

GitHub Pages 启用后，可从仓库首页对应的 Pages 地址进入；`index.html` 会跳转到 `full_probe.html`。

## 本地运行

在本目录启动任意静态 HTTP server，然后访问 `full_probe.html`。项目使用原生 HTML、CSS、JavaScript 和 Canvas，无需构建。

## 文件

- `full_probe.html`：实验页面与指导语
- `full_probe.js`：实验流程、刺激、响应、计分及 XLSX 导出
- `style.css`：页面样式
- `index.html`：GitHub Pages 根入口

## 数据与隐私

本版本会要求输入姓名、性别、年龄、身份证号和手机号，并在浏览器端生成 XLSX。身份证号在导出前会被掩蔽，但姓名和手机号仍会写入导出数据。请仅在已经获得伦理审批、知情同意，并有适当数据保护措施的研究场景中使用。

源码中的 Supabase 地址与 key 是占位符；默认不会向服务器上传数据。不要把 service-role key、管理员密钥、真实被试数据或导出的 XLSX 提交到本仓库。

## 版本说明

这是 `Web_Version/Full_Probe` 的历史静态版本。发布准备只增加了 Pages 入口、说明文件和忽略规则，没有修改实验条件、trial 数量、随机化、刺激、时序、计分、问卷或数据字段。

## MindProbe/JATOS

迁移分支通过独立 storage adapter 将正式 trial 逐条追加到 JATOS，并在每个 block 写 checkpoint、正常结束写 final。练习数据仍只保留在浏览器内；设备端 XLSX 仍是便利副本。构建和部署说明见 `docs/MINDPROBE_DEPLOYMENT.md`。
