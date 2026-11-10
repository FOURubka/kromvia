import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { useLauncher } from "../lib/launcher";
import { Glyph } from "./Glyph";

export function LaunchError({ instanceId, onAccounts }: { instanceId: string; onAccounts: () => void }) {
  const { t } = useI18n();
  const error = useLauncher().errors[instanceId];
  if (!error) return null;
  const noAccount = error.startsWith("nickname must be");
  return (
    <div className="launch-error" role="alert">
      <span>{noAccount ? t("launch.needAccount") : error}</span>
      {noAccount ? (
        <button className="btn" onClick={onAccounts}>
          <Glyph name="user-plus" /> {t("launch.addAccount")}
        </button>
      ) : (
        <button className="btn btn-ghost" onClick={() => invoke("instance_open_log", { instanceId }).catch(() => {})}>
          <Glyph name="external-link" /> {t("game.openLog")}
        </button>
      )}
    </div>
  );
}
