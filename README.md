# Japan Grid Web Visualization

日本 1km 网格、变电站、发电站及关联资料元数据的静态网页可视化项目。

## 本地运行

Windows 下可直接双击：

```bat
启动网页.bat
```

然后打开：

```text
http://127.0.0.1:8000/
```

也可以在项目目录运行：

```bash
python -m http.server 8000 --bind 127.0.0.1
```

## 数据文件

- `data/facilities_web.json`：变电站、发电站节点，以及每个节点关联的 documents / facts。
- `data/mesh_1km_enriched_estimated_web.csv.gz`：1km 网格统计数据，使用 gzip 压缩以适配 GitHub 单文件大小限制。
- `data/metadata.json`：网格数据元信息。

## GitHub Pages

这是纯静态网页，可以用 GitHub Pages 部署。浏览器需要支持 `DecompressionStream` 才能直接读取 `.csv.gz`，建议使用新版 Chrome / Edge / Safari。
