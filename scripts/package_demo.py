#!/usr/bin/env python3
"""Package the active demo and its editable sources with standard-library tools."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
PREFIX = '小悠办公Agent演示包'
INSTRUCTIONS = '''小悠办公 Agent · 完整演示包

直接演示
1. 先完整解压 ZIP，再双击根目录的「小悠办公Agent.html」。
2. 不需要安装依赖或启动服务，脚本、样式和素材均已内嵌。
3. 建议使用桌面版 Chrome 或 Edge；浏览器窗口较窄时可收起侧栏和对话摘要。

建议演示路径
· 从「新建对话」交办工作，查看复杂度、等待时间与任务分工。
· 选择资料来源，切换顶部标签，再返回检查草稿和阅读位置。
· 打开置顶的「经营周报 · 重复工作识别示例」，直接查看保存 Skill 建议。
· 在任务中心进入会话，点击成果卡，查看报告、数据表和子 Agent 过程。
· 市场通过标签切换助理、插件、技能和 MCP。

源码与维护
frontend/ 保存完整页面源码、素材、构建脚本和同版单文件。
tests/ 保存回归检查，README.md 保存功能说明。
修改源码后，在包目录运行：
  python3 frontend/build-standalone.py
生成的新文件为 frontend/程小悠.html；根目录的演示文件是本次交付快照。
回归检查：node --test tests/*.mjs（Node.js 24）。
源码开发预览：python3 -m http.server 8771 --bind 127.0.0.1 --directory frontend
然后访问 http://127.0.0.1:8771/#home。

数据说明
这是本地交互原型，包含明确标记的合成示例。真实模型、业务查询、企业授权、
后台调度和外部写回不代表已经接入服务。演示包不包含你的浏览器本地会话数据；
换电脑或换文件地址后会初始化示例。固定文件位置和浏览器可继续使用本机数据。
release-manifest.json 记录包内文件的 SHA-256，可核对文件是否完整。
'''


def active_files():
    for path in sorted((ROOT / 'frontend').rglob('*')):
        relative = path.relative_to(ROOT)
        if not path.is_file() or path.is_symlink():
            continue
        if any(part.startswith('.') or part == '__pycache__' for part in relative.parts):
            continue
        if 'design-variants' in relative.parts or path.suffix == '.pyc':
            continue
        if path.name == '程小悠-Lovable视觉版.html':
            continue
        yield path
    yield from sorted((ROOT / 'tests').glob('*.mjs'))
    for name in ('README.md', 'CONTRIBUTING.md', 'scripts/package_demo.py'):
        yield ROOT / name


def build_package(output):
    standalone = ROOT / 'frontend' / '程小悠.html'
    if not standalone.is_file():
        raise SystemExit('请先运行 python3 frontend/build-standalone.py')
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    records = []
    with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
        def add(name, data, mode=0o100644):
            entry = ZipInfo(PREFIX + '/' + name)
            entry.create_system = 3
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = (mode & 0xFFFF) << 16
            archive.writestr(entry, data, compresslevel=9)
            records.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

        add('小悠办公Agent.html', standalone.read_bytes())
        add('使用说明.txt', INSTRUCTIONS.encode('utf-8'))
        for path in active_files():
            add(path.relative_to(ROOT).as_posix(), path.read_bytes(), path.stat().st_mode)
        manifest = {'format': 1, 'entry': '小悠办公Agent.html', 'files': records}
        archive.writestr(PREFIX + '/release-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8'))
    with ZipFile(output) as archive:
        bad = archive.testzip()
        if bad:
            raise SystemExit('压缩包校验失败：' + bad)
    print(json.dumps({'path': str(output), 'bytes': output.stat().st_size, 'files': len(records) + 1}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='完整演示包 ZIP 路径')
    build_package(parser.parse_args().output)
