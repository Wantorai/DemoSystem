"use client";

import { useState, useContext, useRef } from "react";
import { AuthContext } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import "./login.css";

export default function LoginPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useContext(AuthContext);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const touchStartRef = useRef(null);
  const submittingRef = useRef(false);

  const rememberTouch = (event) => {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const focusTouchedInput = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    // Focus within the actual tap; don't turn a scrolling gesture into focus.
    if (!start || !touch || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) return;
    event.currentTarget.focus({ preventScroll: true });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password }),
      });

      if (res.ok) {
        const data = await res.json();
        login(data.token);
        router.push("/main");
        return;
      }

      let serverMessage = "";
      try {
        const body = await res.json();
        serverMessage = String(body?.message || body?.error || "").trim();
      } catch {
        // ignore parse error
      }

      if (res.status === 401) {
        setError(serverMessage || "Неверный логин или пароль.");
      } else if (res.status === 404) {
        setError(serverMessage || "Пользователь не найден.");
      } else {
        setError(serverMessage || "Ошибка авторизации. Попробуйте снова.");
      }
    } catch (err) {
      console.error("Ошибка авторизации:", err);
      setError("Ошибка сети. Проверьте подключение и попробуйте снова.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };



  return (
    <main className="login-page">
      <section className="login-card">
      <h2>Вход в систему</h2>
      <form className="login-form" onSubmit={handleLogin} aria-busy={loading}>
        <div className="login-fields">
        <input
          id="login-username"
          name="username"
          aria-label="Имя пользователя"
          type="text"
          placeholder="Имя пользователя"
          autoComplete="username"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          onTouchStart={rememberTouch}
          onTouchEnd={focusTouchedInput}
          onTouchCancel={() => { touchStartRef.current = null; }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          id="login-password"
          name="password"
          aria-label="Пароль"
          type="password"
          enterKeyHint="go"
          onTouchStart={rememberTouch}
          onTouchEnd={focusTouchedInput}
          onTouchCancel={() => { touchStartRef.current = null; }}
          placeholder="Пароль"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        </div>
        <div>
        <button type="submit" disabled={loading}>{loading ? 'Вход…' : 'Войти'}</button>
        </div>
        {error ? (
          <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div>
        ) : null}
      </form>
      </section>
    </main>
  );
}
