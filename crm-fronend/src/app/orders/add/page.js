// app/orders/add/page.js

'use client';

import AddOrderForm from '../../../components/AddOrder';

export default function AddOrderPage() {
    return (
        <div>
            <h1>Добавление нового заказа</h1>
            <AddOrderForm />
        </div>
    );
}