"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FontSizeSettings from "../../../components/FontSizeSettings";
import { applyAppStyle } from "../../../components/AppStyleLoader";

const API = process.env.NEXT_PUBLIC_API_URL;

const badgeStyle = {
  success: { background: "#dcfce7", color: "#166534" },
  failed: { background: "#fee2e2", color: "#991b1b" },
  running: { background: "#fef9c3", color: "#854d0e" },
  idle: { background: "#e5e7eb", color: "#374151" },
};

function fmtDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("ru-RU");
}

export default function AdminPanel() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState("");
  const [retentionDrafts, setRetentionDrafts] = useState({});
  const [primaryOsColor, setPrimaryOsColor] = useState("#007bff");
  const [styleSaving, setStyleSaving] = useState(false);
  const [styleMessage, setStyleMessage] = useState("");

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("token") || "";
  }, []);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadJobs = useCallback(async () => {
    if (!API || !token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/admin/scheduler/jobs`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Не удалось загрузить задачи");
      setJobs(Array.isArray(data) ? data : []);
      if (!selectedJobId && Array.isArray(data) && data.length) setSelectedJobId(data[0].id);
    } catch (e) {
      setError(e?.message || "Ошибка загрузки задач");
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders, selectedJobId]);

  const loadRuns = useCallback(
    async (jobId) => {
      if (!API || !token || !jobId) return;
      setRunsLoading(true);
      try {
        const res = await fetch(`${API}/admin/scheduler/jobs/${jobId}/runs?limit=30`, { headers: authHeaders });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Не удалось загрузить историю");
        setRuns(Array.isArray(data) ? data : []);
      } catch {
        setRuns([]);
      } finally {
        setRunsLoading(false);
      }
    },
    [token, authHeaders]
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!API) return;
    fetch(`${API}/app-style`)
      .then((res) => res.json())
      .then((style) => {
        if (/^#[0-9a-f]{6}$/i.test(String(style?.primaryOsColor || ""))) {
          setPrimaryOsColor(style.primaryOsColor);
        }
      })
      .catch(() => {});
  }, []);

  const saveAppStyle = useCallback(async () => {
    if (!API) return;
    setStyleSaving(true);
    setStyleMessage("");
    try {
      const res = await fetch(`${API}/admin/app-style`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ primaryOsColor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Не удалось сохранить цвет");
      setPrimaryOsColor(data.primaryOsColor);
      applyAppStyle(data);
      localStorage.setItem("app-style", JSON.stringify(data));
      window.dispatchEvent(new CustomEvent("app-style-changed", { detail: data }));
      setStyleMessage("Цвет сохранён");
    } catch (e) {
      setStyleMessage(e?.message || "Ошибка сохранения");
    } finally {
      setStyleSaving(false);
    }
  }, [authHeaders, primaryOsColor]);

  useEffect(() => {
    if (selectedJobId) loadRuns(selectedJobId);
  }, [selectedJobId, loadRuns]);

  const patchJob = useCallback(
    async (jobId, patch) => {
      if (!API) return;
      setSavingId(jobId);
      try {
        const res = await fetch(`${API}/admin/scheduler/jobs/${jobId}`, {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Не удалось обновить задачу");
        await loadJobs();
        if (selectedJobId === jobId) await loadRuns(jobId);
      } catch (e) {
        alert(e?.message || "Ошибка обновления");
      } finally {
        setSavingId(null);
      }
    },
    [authHeaders, loadJobs, loadRuns, selectedJobId]
  );

  const jobCategory = useCallback((job) => {
    const id = String(job?.id || "").toLowerCase();
    const title = String(job?.title || "").toLowerCase();
    const text = `${id} ${title}`;

    if (text.includes("mobile-updates") || text.includes("mobile updates") || text.includes("апдейт") || text.includes("обновлен")) {
      return "mobileUpdates";
    }
    if (text.includes("backup") || text.includes("бэкап") || text.includes("database") || text.includes("db")) {
      return "db";
    }
    if (text.includes("voice") || text.includes("audio") || text.includes("голос") || text.includes("запис")) {
      return "audio";
    }
    if (
      text.includes("media") ||
      text.includes("file") ||
      text.includes("files") ||
      text.includes("image") ||
      text.includes("video") ||
      text.includes("файл") ||
      text.includes("медиа")
    ) {
      return "media";
    }
    return null;
  }, []);

  const categoryLabel = useCallback((cat) => {
    if (cat === "db") return "Бэкапы БД";
    if (cat === "audio") return "Голосовые/аудио";
    if (cat === "media") return "Медиа/файлы";
    if (cat === "mobileUpdates") return "Mobile updates";
    return "";
  }, []);

  const readRetentionDays = useCallback((job) => {
    const fromRoot = Number(job?.retentionDays);
    if (Number.isFinite(fromRoot) && fromRoot >= 0) return fromRoot;
    const fromSettings = Number(job?.settings?.retentionDays);
    if (Number.isFinite(fromSettings) && fromSettings >= 0) return fromSettings;
    const fromMeta = Number(job?.meta?.retentionDays);
    if (Number.isFinite(fromMeta) && fromMeta >= 0) return fromMeta;
    return null;
  }, []);

  const setRetentionDraft = useCallback((jobId, value) => {
    setRetentionDrafts((prev) => ({ ...prev, [jobId]: value }));
  }, []);

  const saveRetentionDays = useCallback(
    async (job) => {
      const draft = String(retentionDrafts[job.id] ?? "").trim();
      if (!draft) return;
      const parsed = Number(draft);
      const isMobileUpdates = jobCategory(job) === "mobileUpdates";
      if (!Number.isFinite(parsed) || parsed < (isMobileUpdates ? 1 : 0)) {
        alert(isMobileUpdates ? "Количество релизов должно быть числом от 1" : "Срок хранения должен быть числом от 0");
        return;
      }
      await patchJob(job.id, { retentionDays: Math.floor(parsed) });
    },
    [retentionDrafts, patchJob, jobCategory]
  );

  const runNow = useCallback(
    async (jobId) => {
      if (!API) return;
      setRunningId(jobId);
      try {
        const res = await fetch(`${API}/admin/scheduler/jobs/${jobId}/run-now`, {
          method: "POST",
          headers: authHeaders,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Не удалось запустить задачу");
        await loadJobs();
        if (selectedJobId === jobId) await loadRuns(jobId);
      } catch (e) {
        alert(e?.message || "Ошибка запуска");
      } finally {
        setRunningId(null);
      }
    },
    [authHeaders, loadJobs, loadRuns, selectedJobId]
  );

  return (
    <div style={{ padding: 16 }}>
      <h1>Стили системы</h1>
      <h2>Размер текста</h2>
      <FontSizeSettings />

      <hr style={{ margin: "20px 0" }} />

      <h2>Основные цвета</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Основной цвет системы:
          <input
            type="color"
            value={primaryOsColor}
            onChange={(event) => setPrimaryOsColor(event.target.value)}
            style={{ width: 48, height: 36, padding: 2 }}
          />
        </label>
        <input
          type="text"
          value={primaryOsColor}
          onChange={(event) => setPrimaryOsColor(event.target.value)}
          pattern="^#[0-9A-Fa-f]{6}$"
          style={{ width: 110 }}
        />
        <button
          type="button"
          onClick={saveAppStyle}
          disabled={styleSaving || !/^#[0-9a-f]{6}$/i.test(primaryOsColor)}
          className="os-primary-bg"
        >
          {styleSaving ? "Сохранение..." : "Сохранить цвет"}
        </button>
        {styleMessage ? <span>{styleMessage}</span> : null}
      </div>

      <hr style={{ margin: "20px 0" }} />

      <h2>Планировщик системных задач</h2>
      <p style={{ color: "#555" }}>Управление очистками и бэкапами без редактирования crontab.</p>

      {error ? <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div> : null}
      {loading ? <div>Загрузка задач...</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div>
          {jobs.map((job) => {
            const style = badgeStyle[job.lastStatus] || badgeStyle.idle;
            const isBusy = savingId === job.id || runningId === job.id;
            return (
              <div
                key={job.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                  cursor: "pointer",
                  background: selectedJobId === job.id ? "#f8fafc" : "#fff",
                }}
                onClick={() => setSelectedJobId(job.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong>{job.title}</strong>
                  <span style={{ ...style, padding: "2px 8px", borderRadius: 8, fontSize: 12 }}>{job.lastStatus}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>{job.description || "-"}</div>

                {jobCategory(job) ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
                      Политика хранения: <strong>{categoryLabel(jobCategory(job))}</strong>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#4b5563" }}>
                        {jobCategory(job) === "mobileUpdates" ? "Хранится сейчас:" : "Текущий срок:"}{" "}
                        <strong>
                          {readRetentionDays(job) == null
                            ? "не задан"
                            : jobCategory(job) === "mobileUpdates"
                              ? `${readRetentionDays(job)} релизов`
                              : `${readRetentionDays(job)} дн.`}
                        </strong>
                      </span>
                      <label style={{ fontSize: 12, color: "#4b5563" }}>
                        {jobCategory(job) === "mobileUpdates" ? "Хранить последние:" : "Удалять через:"}
                        <input
                          type="number"
                          min={jobCategory(job) === "mobileUpdates" ? 1 : 0}
                          placeholder={readRetentionDays(job) == null ? (jobCategory(job) === "mobileUpdates" ? "релизы" : "дни") : String(readRetentionDays(job))}
                          value={retentionDrafts[job.id] ?? ""}
                          onChange={(e) => setRetentionDraft(job.id, e.target.value)}
                          onBlur={() => saveRetentionDays(job)}
                          disabled={isBusy}
                          style={{ width: 90, marginLeft: 6 }}
                        />
                        {" "}{jobCategory(job) === "mobileUpdates" ? "релизов" : "дней"}
                      </label>
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <label>
                    Мин:
                    <input
                      type="number"
                      min={0}
                      max={59}
                      defaultValue={job.minute}
                      onBlur={(e) => patchJob(job.id, { minute: Number(e.target.value) || 0 })}
                      disabled={isBusy}
                      style={{ width: 70, marginLeft: 6 }}
                    />
                  </label>
                  <label>
                    Час:
                    <input
                      type="number"
                      min={0}
                      max={23}
                      defaultValue={job.hour}
                      onBlur={(e) => patchJob(job.id, { hour: Number(e.target.value) || 0 })}
                      disabled={isBusy}
                      style={{ width: 70, marginLeft: 6 }}
                    />
                  </label>
                  <label>
                    Дни недели:
                    <input
                      type="text"
                      defaultValue={job.daysOfWeek || "*"}
                      onBlur={(e) => patchJob(job.id, { daysOfWeek: e.target.value || "*" })}
                      disabled={isBusy}
                      style={{ width: 130, marginLeft: 6 }}
                    />
                  </label>
                  <label>
                    Вкл:
                    <input
                      type="checkbox"
                      checked={Boolean(job.isEnabled)}
                      onChange={(e) => patchJob(job.id, { isEnabled: e.target.checked })}
                      disabled={isBusy}
                      style={{ marginLeft: 6 }}
                    />
                  </label>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => runNow(job.id)} disabled={isBusy}>
                    {runningId === job.id ? "Запуск..." : "Запустить сейчас"}
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                  <div>Следующий запуск: {fmtDate(job.nextRunAt)}</div>
                  <div>Последний запуск: {fmtDate(job.lastRunAt)}</div>
                  <div>Последний успех: {fmtDate(job.lastSuccessAt)}</div>
                  <div>Длительность: {job.lastDurationMs != null ? `${job.lastDurationMs} мс` : "-"}</div>
                  <div>Сообщение: {job.lastMessage || "-"}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <h3>История запусков</h3>
          {runsLoading ? <div>Загрузка...</div> : null}
          {!runsLoading && runs.length === 0 ? <div>Нет запусков</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.map((run) => {
              const style = badgeStyle[run.status] || badgeStyle.idle;
              return (
                <div key={run.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{fmtDate(run.startedAt)}</span>
                    <span style={{ ...style, padding: "2px 8px", borderRadius: 8 }}>{run.status}</span>
                  </div>
                  <div>Длительность: {run.durationMs != null ? `${run.durationMs} мс` : "-"}</div>
                  <div>Код выхода: {run.exitCode != null ? run.exitCode : "-"}</div>
                  {run.output ? (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: "pointer", color: "#1f2937" }}>Логи (stdout)</summary>
                      <pre
                        style={{
                          marginTop: 6,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          background: "#f8fafc",
                          border: "1px solid #e5e7eb",
                          borderRadius: 6,
                          padding: 8,
                          maxHeight: 220,
                          overflow: "auto",
                        }}
                      >
                        {String(run.output)}
                      </pre>
                    </details>
                  ) : null}
                  {run.error ? (
                    <details style={{ marginTop: 6 }} open={run.status === "failed"}>
                      <summary style={{ cursor: "pointer", color: "#991b1b" }}>Ошибки (stderr)</summary>
                      <pre
                        style={{
                          marginTop: 6,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          borderRadius: 6,
                          padding: 8,
                          maxHeight: 220,
                          overflow: "auto",
                          color: "#7f1d1d",
                        }}
                      >
                        {String(run.error)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
