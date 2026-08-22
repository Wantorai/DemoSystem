"use client";

import { useState, useContext } from "react";
import { AuthContext } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import Spinner from "../../components/Spinner";

export default function LoginPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useContext(AuthContext);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
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
      setLoading(false);
    }
  };


if (loading) {
  return <Spinner />;
}

  return (
    <div>
      <h2>Вход в систему</h2>
      <form onSubmit={handleLogin}>
        <div>
        <input
          type="text"
          placeholder="Имя пользователя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        </div>
        <div>
        <button type="submit">Войти</button>
        </div>
        {error ? (
          <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div>
        ) : null}
      </form>
    </div>
  );
}



// "use client";

// import { useState, useContext } from "react";
// import {AuthContext} from "../../context/AuthContext";
// import { useRouter } from "next/navigation";

// export default function LoginPage() {
//   const [name, setName] = useState("");
//   const [password, setPassword] = useState("");
//   const { login } = useContext(AuthContext);
//   const router = useRouter();

//   const handleLogin = async (e) => {
//     e.preventDefault();

//     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ name, password }),
//     });

//     if (res.ok) {
//       const data = await res.json();
//       console.log('Токен: ', data.token);
//       login(data.token);
//       router.push("/main"); // После входа перенаправляем в админку
//     } else {
//       toast("Ошибка авторизации");
//     }
//   };

//   return (
//     <div>
//       <h2>Вход в систему</h2>
//       <form onSubmit={handleLogin}>
//         <input
//           type="text"
//           placeholder="Имя пользователя"
//           value={name}
//           onChange={(e) => setName(e.target.value)}
//           required
//         />
//         <input
//           type="password"
//           placeholder="Пароль"
//           value={password}
//           onChange={(e) => setPassword(e.target.value)}
//           required
//         />
//         <button type="submit">Войти</button>
//       </form>
//     </div>
//   );
// }
