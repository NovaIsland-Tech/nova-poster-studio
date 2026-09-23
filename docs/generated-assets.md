# Nova 原创视觉资产

2026-09-23，使用内置 image_gen 工具生成；虚构人物和无第三方标识产品。原始视觉已转为 WebP 保存于 public/artwork，排版参考位于 public/templates；示例上传 public/sample-product.png 来自原创产品图。中文文字通过 scripts/build-previews.ts 清晰排版。

设计参考：[REJOUICE 作品展示](https://www.rejouice.com/work)、[Awwwards 设计机构作品集](https://www.awwwards.com/websites/design-agencies/?page=3)。借鉴大标题、图像主导、留白与编辑式网格，没有复制其图片或代码。

## 最终生成提示词

### personal-ip

文件：public/artwork/personal-ip.webp

Editorial portrait photograph for Nova personal branding poster, vertical 3:4. Fictional stylish East Asian woman creative director in black tailored jacket, short hair, confident relaxed pose, waist-up lower half composition, warm burnt orange seamless studio background, dramatic soft side lighting, large empty upper third for title. Premium fashion campaign, realistic skin, no text, no watermark.

### product-new

文件：public/artwork/product-new.webp

Premium skincare advertising photograph for Nova poster, vertical 3:4. A sculptural frosted sage-green glass serum bottle with minimal blank label, rounded cream cap, resting on pale travertine slab, olive leaf shadows, soft pale sage background, bottle occupies lower two-thirds, empty upper third for headline. Beautiful directional sunlight, tactile material, luxury still life, no text, no logos, no watermark.

### course-open

文件：public/artwork/course-open.webp

Original editorial 3D art for Nova creative design course poster, vertical 3:4. Sculptural cobalt blue folded ribbon looping through a warm ivory geometric arch, orange sphere, architectural concrete plinth, precise sophisticated gallery lighting, pale ivory seamless background, objects placed lower two-thirds leaving upper third empty for headline. Tangible clay and lacquer, contemporary design magazine aesthetic, no text, no logos, no watermark.

### speaker

文件：public/artwork/speaker.webp

Original premium editorial photograph for Nova speaker poster. Vertical 3:4. Fictional East Asian male architect around 40, charcoal knit shirt, thin glasses, calm warm expression, standing with arms naturally crossed in lower two-thirds. Muted sage gray studio background, large empty upper third for headline. Natural realistic skin, soft side light, no text, watermark or logo.

### lifestyle

文件：public/artwork/lifestyle.webp

Original premium lifestyle editorial photograph for Nova portrait poster. Vertical 3:4. Fictional East Asian woman with long dark hair in cream linen shirt, sitting beside sunlit cafe window, candid thoughtful pose, warm film colors, soft leafy shadows and warm beige plaster wall filling upper third as clean title space. Beautiful natural skin detail, subject lower two thirds, no text, logo or watermark.

### course-new

文件：public/artwork/course-new.webp

Original high-end art direction image for Nova AI creativity course poster. Vertical 3:4. Translucent lavender glass flowing sculptural knot balanced on a polished black cube, chrome sphere, periwinkle background, luminous caustics, sophisticated contemporary gallery photography of physical sculpture, objects lower two thirds with empty upper third for title. No text, logo or watermark.

### course-enroll

文件：public/artwork/course-enroll.webp

Original editorial still life photograph for Nova learning workshop poster. Vertical 3:4. Open cream sketchbook with blank pages, sculptural orange pencil, cobalt folded paper and small charcoal geometric objects on terracotta desk, artistic diagonal sunlight, view from above, arranged in lower two thirds, upper third empty warm peach backdrop for headline. Premium tactile art-school campaign, no text, logos or watermark.

### product-detail

文件：public/artwork/product-detail.webp

Original premium macro product campaign photograph for Nova. Vertical 3:4. Sculptural ivory wireless over-ear headphones on sand colored stone pedestal, close detail of soft leather and brushed aluminum, elegant organic shadows on warm off-white background. Product placed lower two thirds, spacious empty upper third for title. Photoreal luxury industrial design, no logos, text or watermark.

### product-sale

文件：public/artwork/product-sale.webp

Original vibrant product campaign photograph for Nova seasonal promotion poster. Vertical 3:4. Bright tangerine sneaker with cream sculptural sole floating above a cobalt blue plinth, powerful crisp studio shadows on vivid pale apricot background, dynamic diagonal angle, refined sport editorial styling. Product lower two thirds, upper third clean for large headline. No text, logos or watermark.

## 验证与发布

- Cloudflare Pages: https://nova-poster-studio.pages.dev/
- 五步流程保留；新增首页、最近作品、继续草稿、文案预览、作品搜索和删除。
- 删除使用 `nova_delete_work`：仅所有者可操作，仅已完成/失败任务可删除；移除存储图片，保留后台额度账目，不触发退款。画廊过滤 `deleted_at`。
- 新版端到端测试：`npx playwright test tests/e2e/redesign.spec.ts`。使用临时账号和真实 Supabase；拦截模型响应，不修改线上模型设置、不产生真实生图费用。
- 原始集成套件依赖无启用模型的环境；不要对当前有真实模型的生产项目运行该旧套件。
- 模板风格同步 SQL：`scripts/update-template-art.sql`，仅匹配旧默认风格，保留用户自定义风格。


## 创作页三张示例叠放图（2026-09-23）

文件：`public/artwork/inspiration-stack.webp`。使用内置 ImageGen，以人物、课程、产品的第二张示例 `speaker.webp`、`course-new.webp`、`product-detail.webp` 为参考生成，替换上传步骤右侧旧图。

Prompt:
> Create one polished editorial mockup image for Nova poster studio website sidebar. Use the three attached posters as exact visual references: 1 male speaker portrait sage background, 2 lavender glass sculpture course poster, 3 ivory headphones product poster. Show all THREE as physical rounded-corner print cards in an elegant overlapping fan stack, speaker at left tilted -12 degrees, course behind at center rising higher, headphones at right front tilted +10 degrees. Each subject clearly visible, moderate overlap only. Preserve reference poster designs and Chinese typography as closely as possible. Soft peach to pale lavender studio background matching a friendly premium creative app, tactile thick paper edges, delicate realistic contact shadows, subtle floating depth, art-directed asymmetry, generous breathing room around the complete stack, no cropped cards. Square composition. No new text outside the cards, no extra objects, no watermark. This is a finished raster website asset, not a screenshot of an app.
