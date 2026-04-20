import { importModuleAction } from '../actions';
import { GenerationProgress } from '@/app/_components/GenerationProgress';

export const dynamic = 'force-dynamic';

export default async function ImportModulePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl">导入已有剧情</h1>
      <p className="text-sm text-ink-300">
        把你已有的剧情文档（小说式、提纲式、甚至对话记录都可以）粘贴进来，
        AI 会整理成统一的模组结构。缺失的部分会被合理补全，我们会把补全情况写进 `meta.warnings`。
      </p>
      <p className="text-xs text-ink-400">
        输入上限约 40,000 字。整理过程通常 <strong className="text-ink-200">30 秒 - 2 分钟</strong>，
        按钮上会显示实时耗时，勿重复点击。
      </p>

      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">
          {sp.error}
        </p>
      )}

      <form action={importModuleAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-200">标题提示（可选）</span>
            <input
              name="title_hint"
              placeholder="e.g. 雾中小镇"
              className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-200">时代提示</span>
            <select
              name="era_hint"
              defaultValue="1920s"
              className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
            >
              <option value="1920s">1920s 经典</option>
              <option value="modern">现代</option>
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-200">文档内容</span>
          <textarea
            name="raw_text"
            required
            rows={18}
            placeholder="把剧情文字贴进这里……"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-rust-500"
          />
        </label>

        <GenerationProgress
          label="整理文档为模组结构"
          expectedSec={45}
          phases={[
            { from: 0,  label: '连接 DeepSeek 整理器' },
            { from: 3,  label: '解析你粘贴的文本' },
            { from: 12, label: '提取场景 / NPC / 线索' },
            { from: 30, label: '补全缺失部分并交叉验证' },
            { from: 60, label: '快好了，再等一会儿' },
          ]}
          submitButton={
            <button
              type="submit"
              className="rounded border border-rust-600 bg-rust-700/60 px-5 py-2 hover:bg-rust-600"
            >
              开始整理
            </button>
          }
        />
      </form>
    </section>
  );
}
