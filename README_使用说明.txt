日本电力设施与网格可视化网页包

打开方式：
1. 双击“启动网页.bat”
2. 浏览器打开 http://127.0.0.1:8000/
3. 查看结束后，关闭启动网页的黑色窗口即可

文件内容：
- index.html：网页入口
- app.js：地图、筛选、点击展示等交互逻辑
- styles.css：页面样式
- data/facilities_web.json：变电站、发电站及其关联资料元数据
- data/mesh_1km_enriched_estimated_web.csv：1km 网格及估算/统计指标
- data/metadata.json：网格数据字段说明与元信息

注意：
- 不建议直接双击 index.html 打开，因为浏览器可能拦截本地 CSV/JSON 读取。
- 如果 8000 端口被占用，可以在命令行进入本文件夹后运行：
  python -m http.server 8010 --bind 127.0.0.1
  然后打开 http://127.0.0.1:8010/
