// app/clients/add/page.js

'use client';

import AddClientForm from '../../../components/AddClient';

export default function AddClientPage() {
    return (
        <div>
            <h1>Добавление нового клиента</h1>
            <AddClientForm />
        </div>
    );
}
