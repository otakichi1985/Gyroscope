import { useEffect } from "react";
import { useUpdateStore } from "../stores/updateStore";

const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function useAutoCheckForUpdate() {
  const loadStatic = useUpdateStore((s) => s.loadStatic);
  const check = useUpdateStore((s) => s.check);

  useEffect(() => {
    loadStatic();
    check();
    const timer = window.setInterval(() => {
      check();
    }, PERIODIC_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // アプリ生存中の確認loopなので、無関係な再描画では再起動しない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
