import { useAppUpdate } from "../nativeUpdate";
import { formatBytes } from "../update";

/* Android only: tells the user a newer Ruminate is available and installs it in place. */
export function UpdateBanner() {
  const { state, update, later } = useAppUpdate();
  if (state.kind === "hidden") return null;

  if (state.kind === "downloading" || state.kind === "installing") {
    const percent = state.kind === "downloading" && state.total > 0 ? Math.min(100, Math.round(state.read / state.total * 100)) : null;
    return <div className="update-banner" role="status">
      <div className="update-copy">
        <strong>{state.kind === "installing" ? "Installing update..." : "Downloading update..."}</strong>
        {state.kind === "downloading" && <small>{percent !== null ? `${percent}% of ${formatBytes(state.total)}` : formatBytes(state.read)}</small>}
      </div>
      <div className="update-progress"><i style={{ width: `${state.kind === "installing" ? 100 : percent ?? 0}%` }} /></div>
    </div>;
  }

  if (state.kind === "needs-permission") {
    return <div className="update-banner" role="status">
      <div className="update-copy"><strong>One quick step</strong><small>Allow Ruminate to install apps, then come back to finish the update.</small></div>
      <div className="update-actions"><button className="primary" onClick={update}>Open settings</button></div>
    </div>;
  }

  if (state.kind === "failed") {
    return <div className="update-banner" role="alert">
      <div className="update-copy"><strong>Update did not finish</strong><small>{state.message}</small></div>
      <div className="update-actions">
        {state.release.versionCode !== null && <button className="primary" onClick={update}>Try again</button>}
        <button className="update-later" onClick={later}>Later</button>
      </div>
    </div>;
  }

  const notes = state.release.notes.split("\n")[0].trim();
  return <div className="update-banner" role="status">
    <div className="update-copy"><strong>Ruminate {state.release.version} is available</strong>{notes && <small>{notes}</small>}</div>
    <div className="update-actions">
      <button className="primary" onClick={update}>{state.store ? "Open Play Store" : "Update"}</button>
      <button className="update-later" onClick={later}>Later</button>
    </div>
  </div>;
}
