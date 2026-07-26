import { requireUser } from '@/lib/auth';
import { getUserVisualSettings } from '@/lib/localdb/users';
import {
  saveVisualSettingsAction,
  clearAllVisualsAction,
  clearAllSessionsAction,
} from './actions';
import { Card } from '@/app/_components/Card';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    visual_saved?: string;
    purged_visuals?: string;
    purged_sessions?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const visual = await getUserVisualSettings(user.id);
  const codexModel = process.env['CODEX_MODEL_CHAT'] ?? 'gpt-5.4-mini';
  const reasoningEffort = process.env['CODEX_REASONING_EFFORT'] ?? 'low';

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl">设置</h1>
        <p className="mt-1 text-sm text-ink-400">{user.email}</p>
      </div>

      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">{sp.error}</p>
      )}
      {sp.visual_saved && (
        <p className="rounded border border-emerald-600/60 bg-emerald-700/10 p-3 text-sm text-emerald-200">
          图片生成设置已保存。
        </p>
      )}
      {sp.purged_visuals !== undefined && (
        <p className="rounded border border-emerald-600/60 bg-emerald-700/10 p-3 text-sm text-emerald-200">
          已清除 {sp.purged_visuals} 张图片资产。
        </p>
      )}
      {sp.purged_sessions !== undefined && (
        <p className="rounded border border-emerald-600/60 bg-emerald-700/10 p-3 text-sm text-emerald-200">
          已清除 {sp.purged_sessions} 局跑团存档（相关图片也一并删除）。人物卡和模组保留。
        </p>
      )}

      <Card title="Codex / ChatGPT">
        <p className="mb-4 text-sm text-ink-300">
          AI 生成模组、导入整理和 KP 推进均通过本机 Codex 调用，并复用当前的 ChatGPT 登录。
          本项目不读取或保存 OpenAI、DeepSeek API key。
        </p>
        <div className="space-y-2 rounded border border-ink-800 bg-ink-950 p-3 text-sm">
          <div>
            <span className="text-ink-400">模型：</span>
            <span className="font-mono text-emerald-300">{codexModel}</span>
          </div>
          <div>
            <span className="text-ink-400">推理强度：</span>
            <span className="font-mono text-emerald-300">{reasoningEffort}</span>
          </div>
          <p className="text-xs text-ink-500">
            如需重新登录，请先在本机终端运行 <code>codex login</code>，然后重启本服务。
          </p>
        </div>
      </Card>

      <Card title="证物图像（ComfyUI 本地）">
        <p className="mb-4 text-sm text-ink-300">
          开启后，每当玩家在游戏里发现新线索，就向本地 ComfyUI 下发一条 SD-Turbo 生成任务，
          图像异步出图后挂在线索板上。模型未装好 / 服务未起时，生成会失败并显示错误，不会影响回合本身。
          <br />
          需要的模型（all-in-one，放到 ComfyUI/models/checkpoints/）：
          <code className="ml-1 text-ink-200">sd_turbo.safetensors</code>
          （Stability AI SD-Turbo，约 5.2 GB，适合本机 8 GB 显存）。
        </p>

        <form action={saveVisualSettingsAction} className="space-y-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={visual.enabled}
              className="h-4 w-4 rounded border-ink-600 bg-ink-900"
            />
            <span>启用证物图像生成</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-ink-200">ComfyUI 地址</span>
            <input
              type="url"
              name="comfyui_base_url"
              defaultValue={visual.comfyui_base_url}
              placeholder="http://127.0.0.1:8188"
              className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-sm outline-none focus:border-rust-500"
            />
            <span className="mt-1 block text-xs text-ink-500">
              无斜杠结尾；确保这里能访问到你启动 ComfyUI 的 host 和端口。
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-ink-200">自动生成档位</span>
            <select
              name="auto"
              defaultValue={visual.auto}
              className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-rust-500"
            >
              <option value="off">off — 只手动触发</option>
              <option value="key_only">key_only — 仅关键线索（major / finale）</option>
              <option value="normal">normal — 所有发现的线索</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-ink-200">每局最多生成张数</span>
            <input
              type="number"
              name="max_per_session"
              min={1}
              max={300}
              defaultValue={visual.max_per_session}
              className="w-24 rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-rust-500"
            />
            <span className="mt-1 block text-xs text-ink-500">
              目前每回合都会生成一张定场图（再加上发现线索的话还有证物图），所以这个数字要够高。
            </span>
          </label>

          <button
            type="submit"
            className="rounded border border-rust-600 bg-rust-700/60 px-4 py-2 text-sm hover:bg-rust-600"
          >
            保存
          </button>
        </form>
      </Card>

      <Card title="危险区域">
        <p className="mb-4 text-sm text-ink-300">
          下面两个操作不可撤销。只删你自己的数据，不影响别的账号。两个都需要在确认框里输入
          <code className="mx-1 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-rust-300">删除</code>
          才会真的执行。
        </p>

        <div className="space-y-6">
          <form action={clearAllVisualsAction} className="rounded border border-rust-700/50 bg-rust-700/5 p-4">
            <h3 className="mb-1 font-serif text-base text-rust-200">清除全部图片</h3>
            <p className="mb-3 text-xs text-ink-400">
              删除所有已生成的场景/证物图片（资产行 + 磁盘文件）。跑团存档保留，下次进入场景会重新生成图片。
            </p>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-ink-300">确认：</span>
              <input
                type="text"
                name="confirm"
                placeholder="输入 删除"
                autoComplete="off"
                className="w-28 rounded border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-sm outline-none focus:border-rust-500"
              />
              <button
                type="submit"
                className="ml-2 rounded border border-rust-600 bg-rust-700/50 px-3 py-1 text-sm hover:bg-rust-600"
              >
                清除图片
              </button>
            </label>
          </form>

          <form action={clearAllSessionsAction} className="rounded border border-rust-700/60 bg-rust-700/10 p-4">
            <h3 className="mb-1 font-serif text-base text-rust-200">清除全部跑团存档</h3>
            <p className="mb-3 text-xs text-ink-400">
              删除所有 sessions / turns / checks / events / clues / npcs / growth_records，以及所有图片。
              <br />
              <span className="text-rust-300">保留：人物卡（/investigators）、模组（/modules）、你的账号。</span>
            </p>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-ink-300">确认：</span>
              <input
                type="text"
                name="confirm"
                placeholder="输入 删除"
                autoComplete="off"
                className="w-28 rounded border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-sm outline-none focus:border-rust-500"
              />
              <button
                type="submit"
                className="ml-2 rounded border border-rust-600 bg-rust-700/70 px-3 py-1 text-sm hover:bg-rust-600"
              >
                清除存档
              </button>
            </label>
          </form>
        </div>
      </Card>

      <Card title="账号">
        <div className="space-y-1 text-sm text-ink-300">
          <p>邮箱：{user.email}</p>
          <p className="text-xs text-ink-500">
            密码修改、重置邮件这些功能还没做；你要换账号只能注册一个新邮箱。
          </p>
        </div>
      </Card>
    </section>
  );
}
