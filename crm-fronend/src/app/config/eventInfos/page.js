"use client";

import { useEffect, useState, useRef } from "react";


export default function EventInfoPage() {

  const isFetched = useRef(false);
  const [localData, setLocalData] = useState([]);


  // Загрузка параметров (dataParams)
  useEffect(() => {
    if (isFetched.current) return;
    isFetched.current = true;

    const fetchParams = async () => {
      try {
        const [mainModelData, configData] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`).then((res) => res.json()),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/config`).then((res) => res.json()),
        ]);

        const combinedData = mainModelData.concat(configData);

        // Формируем параметры для отправки
        const transformedData = combinedData.map(({ paramName, label }) => ({
          paramName,
          label,
        }))

        // console.log("transformedData = ", transformedData)

        // Загружаем уже существующие записи из eventInfos
        const existingRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config/eventInfos`);
        let existingData = await existingRes.json();

        // console.log("existingData = ", existingData)


        // Находим новые параметры, которых ещё нет в базе (сравниваем по paramName)
        const newParams = transformedData.filter(
          (newParam) =>
            !existingData.some(
              (existingParam) => existingParam.paramName === newParam.paramName
            )
        );

        // console.log("newParams = ", newParams)

        if (newParams.length > 0) {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config/eventInfos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newParams: newParams }),
          });

          // Повторный запрос, чтобы получить новые
          const updatedRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config/eventInfos`);
          existingData = await updatedRes.json();
        }

        // console.log("existingData = ", existingData)

        setLocalData(existingData);
      } catch (error) {
        console.error("Ошибка при загрузке моделей:", error);
      }
    };

    fetchParams();
  }, []);




  const handleCheckboxChange = (paramId) => {
    setLocalData((prevData) =>
      prevData.map((item) =>
        item.paramId === paramId ? { ...item, allowed: !item.allowed } : item
      )
    );
  };

  const handleSave = async () => {
    try {
      // console.log("localData = ", localData)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/config/eventInfos`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updatedParams: localData }),
        }
      );

      if (!response.ok) {
        throw new Error("Ошибка при сохранении");
      }

      const updatedData = await response.json();
      setLocalData(updatedData); // Обновляем данные в родительском компоненте
    } catch (error) {
      console.error("Ошибка сохранения:", error);
    }
  };
  


  // Обработчики изменения label и добавления нового параметра (оставляем без изменений)
  const handleLabelChange = (paramId, value) => {
    setLocalData((prevData) =>
      prevData.map((param) =>
        param.paramId === paramId ? { ...param, paramLabel: value } : param
      )
    );
  };



  return (
    <div>
      <table className="min-w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2">Имя</th>
            <th className="border border-gray-300 px-4 py-2">Обозначение</th>
            <th className="border border-gray-300 px-4 py-2">Включено</th>
          </tr>
        </thead>
        <tbody>
          {localData
          .sort((a, b) => a.paramName.localeCompare(b.paramName))
          .map(({ paramId, paramName, paramLabel, allowed }) => (
            <tr key={paramId} className="border border-gray-300">
              <td className="border border-gray-300 px-4 py-2">{paramName}</td>
              {/* <td className="border border-gray-300 px-4 py-2">{paramLabel}</td> */}
              <td>
                  <input
                    className="permissions_value"
                    type="text"
                    value={paramLabel || ""}
                    onChange={(e) => handleLabelChange(paramId, e.target.value)}                  
                  />
                </td>
              <td className="border border-gray-300 px-4 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allowed}
                  onChange={() => handleCheckboxChange(paramId)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={handleSave}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Сохранить
      </button>
    </div>
  );
};
