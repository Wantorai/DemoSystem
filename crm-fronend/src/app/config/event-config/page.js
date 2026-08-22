// crm-fronend\src\app\config\event-config\page.js

'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

// Формирует список активных полей из конфигурации графика.
const generateFieldOptions = (schedule) => {
  const excludeKeys = ['id'];

  return Object.keys(schedule)
    .filter(key => schedule[key]?.checked === true && !excludeKeys.includes(key))
    .map(key => ({
      value: key,
      label: `${key} - ${schedule[key].label}`
    }));
};

const AdminEventConfig = () => {
  // Список параметров будет сформирован автоматически из заказа
  const [fieldOptions, setFieldOptions] = useState([]);
  // Конфигурация рендера загружается с бэкенда
  const [config, setConfig] = useState([]);


  const fetchConfig = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/event-config`);
      const data = await response.json();
      // console.log("Загруженная конфигурация:", data);
  
      // Если API возвращает массив, где нужная конфигурация находится в data[0].config,
      // то возвращаем именно этот массив
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].config)) {
        return data[0].config;
      } else {
        console.error("Ошибка: Неверный формат данных конфигурации", data);
        return [];
      }
    } catch (error) {
      console.error("Ошибка загрузки:", error);
      return [];
    }
  };
  




  // Загружаем конфигурацию при монтировании компонента
  useEffect(() => {
    fetchConfig().then(fetchedConfig => {
      setConfig(fetchedConfig);
    });
  }, []);
  
  

  // При загрузке получаем конфигурацию schedule и формируем fieldOptions,
  // добавляя к ним вычисляемые поля clientPhone и technicName
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/schedule`)
      .then(response => response.json())
      .then(schedule => {
        const generatedOptions = generateFieldOptions(schedule);
        const computedOptions = [
          { value: 'technicName', label: 'Имя технолога' }
        ];
        setFieldOptions([...generatedOptions, ...computedOptions]);
      })
      .catch(error => console.error('Ошибка при загрузке schedule:', error));
  }, []);

  const handleChangeRowType = (index, newType) => {
    const newConfig = [...config];
    newConfig[index].type = newType;
    if (newType === 'single') {
      newConfig[index].field = fieldOptions[0].value;
      delete newConfig[index].fields;
    } else if (newType === 'multi') {
      newConfig[index].fields = [fieldOptions[0].value];
      delete newConfig[index].field;
    }
    setConfig(newConfig);
  };

  const handleChangeField = (index, newField) => {
    const newConfig = [...config];
    newConfig[index].field = newField;
    setConfig(newConfig);
  };

  const handleChangeMultiField = (rowIndex, fieldIndex, newField) => {
    const newConfig = [...config];
    if (newConfig[rowIndex].type === 'multi') {
      newConfig[rowIndex].fields[fieldIndex] = newField;
      setConfig(newConfig);
    }
  };

  const handleAddMultiField = (rowIndex) => {
    const newConfig = [...config];
    if (newConfig[rowIndex].type === 'multi') {
      newConfig[rowIndex].fields.push(fieldOptions[0].value);
      setConfig(newConfig);
    }
  };

  const handleRemoveMultiField = (rowIndex, fieldIndex) => {
    const newConfig = [...config];
    if (newConfig[rowIndex].type === 'multi' && newConfig[rowIndex].fields.length > 1) {
      newConfig[rowIndex].fields.splice(fieldIndex, 1);
      setConfig(newConfig);
    }
  };

  // const handleStyleChange = (index, styleProp, value) => {
  //   const newConfig = [...config];
  //   newConfig[index].style = {
  //     ...newConfig[index].style,
  //     [styleProp]: value
  //   };
  //   setConfig(newConfig);
  // };

  // Добавить новую строку
  const addRow = (type) => {
    const newRow = type === 'single'
      ? { type: 'single', field: fieldOptions[0].value, style: {} }
      : { type: 'multi', fields: [fieldOptions[0].value], style: {} };

    setConfig([...config, newRow]);
  };

  // Удалить строку
  const removeRow = (index) => {
    const newConfig = config.filter((_, i) => i !== index);
    setConfig(newConfig);
  };

  const handleSave = async () => {
    try {
      // Удаляем элементы DOM или другие циклические структуры из конфигурации
      const configToSave = config.map(row => {
        // Если тип multi, гарантируем, что fields – массив (иначе ставим пустой массив)
        const fields = row.type === 'multi' 
            ? (Array.isArray(row.fields) ? row.fields : [])
            : row.field; // для single используем поле field
      
        return {
          ...row,
          // Обновляем style через глубокое клонирование
          style: JSON.parse(JSON.stringify(row.style)),
          ...(row.type === 'multi' ? { fields } : { field: fields })
        };
      });

      // console.log("Отправляемые данные:", configToSave);
  
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/event-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configToSave }), // Передаем очищенную конфигурацию
      });
  
      if (response.ok) {
        // toast('Конфигурация сохранена!');
      } else {
        toast('Ошибка при сохранении в handleSave');
      }
    } catch (error) {
      console.error('Ошибка:', error);
      toast('Ошибка сети');
    }
  };
  
  

  return (
    <div style={{ padding: '20px' }}>
      <h2>Конфигурация события в графике</h2>
      {config.map((row, index) => (
        <div
          key={index}
          style={{
            border: '1px solid #ccc',
            padding: '10px',
            marginBottom: '10px',
            borderRadius: '4px'
          }}
        >
          <div>
            <label style={{ marginRight: '10px' }}>Тип строки:</label>
            <select
              value={row.type}
              onChange={(e) => handleChangeRowType(index, e.target.value)}
            >
              <option value="single">Однострочная</option>
              <option value="multi">Мультистрочная</option>
            </select>
          </div>

          {row.type === 'single' ? (
            <div style={{ marginTop: '10px' }}>
              <label style={{ marginRight: '10px' }}>Поле:</label>
              <select
                value={row.field}
                onChange={(e) => handleChangeField(index, e.target.value)}
              >
                {fieldOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ marginTop: '10px' }}>
              <label>Поля:</label>
              {(Array.isArray(row.fields) ? row.fields : []).map((field, fieldIndex) => (
                <div key={fieldIndex} style={{ display: 'flex', alignItems: 'center', marginTop: '5px' }}>
                  <select
                    value={field}
                    onChange={(e) => handleChangeMultiField(index, fieldIndex, e.target.value)}
                  >
                    {fieldOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    style={{ marginLeft: '5px' }}
                    onClick={() => handleRemoveMultiField(index, fieldIndex)}
                    type="button"
                  >
                    Удалить
                  </button>
                </div>
              ))}

              <button
                style={{ marginTop: '5px' }}
                onClick={() => handleAddMultiField(index)}
                type="button"
              >
                Добавить поле
              </button>
            </div>
          )}

          <div style={{ marginTop: '10px' }}>
            <label>Стили (JSON):</label>
            <textarea
              rows="3"
              style={{ width: '100%', marginTop: '5px' }}
              value={JSON.stringify(row.style, null, 2)}
              onChange={(e) => {
                try {
                  const newStyles = JSON.parse(e.target.value);
                  const newConfig = [...config];
                  newConfig[index].style = newStyles;
                  setConfig(newConfig);
                } catch (error) {
                  console.error("Неверный формат JSON", error);
                }
              }}
            />
          </div>

          <button onClick={() => removeRow(index)} style={{ marginTop: '10px', color: 'red' }}>
            Удалить строку
          </button>
        </div>
      ))}

      <button onClick={() => addRow('single')} style={{ padding: '10px 20px', fontSize: '16px', marginRight: '10px' }}>
        Добавить однострочную
      </button>
      <button onClick={() => addRow('multi')} style={{ padding: '10px 20px', fontSize: '16px' }}>
        Добавить мультистрочную
      </button>

      <button onClick={handleSave} style={{ padding: '10px 20px', fontSize: '16px', marginTop: '10px' }}>
        Сохранить конфигурацию
      </button>

      <h3 style={{ marginTop: '20px' }}>Текущая конфигурация (JSON):</h3>
      <pre>{JSON.stringify(config, null, 2)}</pre>
    </div>
  );
};

export default AdminEventConfig;



