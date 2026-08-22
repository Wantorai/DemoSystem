'use client';

import React from 'react';


const EventRender = ({ order, lookupMap, accessibleParams, eventConfig }) => {

  // Функция для получения значения по имени поля
  const getValue = (field) => {
    const value = order && order[field] !== undefined ? order[field] : '—';
    
    // Если поле есть в lookupMap (то есть это список), заменяем ID на label
    return lookupMap[field] && lookupMap[field][value] ? lookupMap[field][value] : value;
  };

  return (
    <div>
      {eventConfig.map((line, index) => {
        if (line.type === 'single') {
          const isVisible = Array.from(accessibleParams).some(p => p.param === line.field);
          if (!isVisible) return null;
  
          return (
            <div key={index} style={line.style}>
              {getValue(line.field)}
            </div>
          );
        } 
        
        if (line.type === 'multi') {
          // Фильтруем доступные поля
          const visibleFields = line.fields.filter(field =>
            Array.from(accessibleParams).some(p => p.param === field)
          );
  
          // Если после фильтрации полей нет, скрываем div
          if (visibleFields.length === 0) return null;
  
          return (
            <div key={index} style={line.style}>
              {visibleFields.map((field, idx) => (
                <React.Fragment key={idx}>
                  {getValue(field)}
                  {idx < visibleFields.length - 1 && ' | '}
                </React.Fragment>
              ))}
            </div>
          );
        }
        
        return null;
      })}
    </div>
  );
};

export default React.memo(EventRender);





// // src/components/EventRender.js

// 'use client';  // Это директива, чтобы компонент стал клиентским

// import React from 'react';
// import eventConfig from '../config/Event/page';

// const EventRender = ({ order, lookupMap  }) => {
  
//   // Функция для получения значения по имени поля
//   // const getValue = (field) => {
//   //     return order && order[field] !== undefined ? order[field] : '—';
//   // };

//   // Функция для получения значения по имени поля
//   const getValue = (field) => {
//     const value = order && order[field] !== undefined ? order[field] : '—';
    
//     // Если поле есть в lookupMap (то есть это список), заменяем ID на label
//     return lookupMap[field] && lookupMap[field][value] ? lookupMap[field][value] : value;
//   };

//   return (
//     <div>
//       {eventConfig.map((line, index) => {
//         if (line.type === 'single') {
//           return (
//             <div key={index} style={line.style}>
//               {getValue(line.field)}
//             </div>
//           );
//         } else if (line.type === 'multi') {
//           return (
//             <div key={index} style={line.style}>
//               {line.fields.map((field, idx) => (
//                 <React.Fragment key={idx}>
//                   {getValue(field)}
//                   {idx < line.fields.length - 1 && ' | '}
//                 </React.Fragment>
//               ))}
//             </div>
//           );
//         }
//         return null;
//       })}
//     </div>
//   );
// };

// export default EventRender;
