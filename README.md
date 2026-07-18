# Japan Grid Web Visualization

日本 1km 网格、变电站、发电站、关联资料元数据及 Balanced v2 电网拓扑的静态网页可视化项目。

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
- `data/topology_balanced_v2.json.gz`：Balanced v2 设施级拓扑节点、边和质量摘要。
- `scripts/build_topology_web_data.py`：从 Balanced 节点/边表生成网页拓扑数据，并按名称与坐标关联已有设施详情。

## GitHub Pages

这是纯静态网页，可以用 GitHub Pages 部署。浏览器需要支持 `DecompressionStream` 才能直接读取 `.csv.gz`，建议使用新版 Chrome / Edge / Safari。
