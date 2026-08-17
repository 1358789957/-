# 透明软胶 · 3D 物理模拟

洁具售卖仓库中的交互演示：一根透明软胶，用 XPBD 软体求解，可实时调节软度，并可切换形态。

## 手机预览

构建后的页面在 `docs/`，推送到 GitHub 后可用下面地址直接打开（不用装环境）：

- https://raw.githack.com/1358789957/-/cursor/soft-gel-physics-22b6/docs/index.html
- https://cdn.jsdelivr.net/gh/1358789957/-@cursor/soft-gel-physics-22b6/docs/index.html

若要变成仓库自带的 GitHub Pages 地址 `https://1358789957.github.io/-/`：仓库 Settings → Pages → Build and deployment → Source 选 **Deploy from a branch**，Branch 选 `cursor/soft-gel-physics-22b6`，Folder 选 `/docs`，保存后等一两分钟。

## 功能

- 透明凝胶材质（透射、折射、清漆高光）
- 空心壁厚软胶（不是实心），开口能看到内壁
- 四种形态：空心圆柱、空心圆珠、空心棱柱、空心握柄（末端球形膨胀）
- 重置只回正姿态，不改当前形态和雕刻
- 左上角 XYZ 轴用数值调节方向，可将当前角度设为零点
- XPBD 距离约束 + 体积保持 + 形状匹配，倒下后仍保持所选形态
- 拖拽揉捏、抛落、轻弹
- 软度 / 阻尼 / 重力滑杆，以及硬胶、中等、超软预设
- 色盘与预设色块，可改软胶颜色（表面色 + 体积透射色）
- 固定模式：打洞、切削、裁切，可撤销 / 清除；回到模拟后仍带物理
- 可选固定底部

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开提示的本地地址。手机可单指揉捏，空白处旋转视角。

```bash
npm run build
npm run preview
```

## 物理说明

求解器只在胶壁上生成质点（内层 / 中层 / 外层圆环，空腔里没有质点），再把静止坐标写成所选空心形态。每帧做：

1. 半隐式积分
2. XPBD 距离约束（结构 / 剪切 / 弯曲）
3. 四面体体积约束，接近不可压缩
4. 地面摩擦与手指碰撞
5. 底部粘滞摩擦，揉捏时不容易整根滑走

软度对应约束柔度（compliance）：越高越软。体积项相对更硬，避免果冻“泄气”。
