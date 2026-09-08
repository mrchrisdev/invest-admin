const usersStorageKey = 'investUsers';
const requestsStorageKey = 'investRequests';
const cardFee = 5;

function addTransaction(user, transaction) {
    user.transactions ||= [];
    user.transactions.push({
        id: transaction.id || `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        status: 'Completed',
        ...transaction
    });
}
const usersTableBody = document.getElementById('usersTableBody');
const userCount = document.getElementById('userCount');
const adminStatus = document.getElementById('adminStatus');
const requestsTableBody = document.getElementById('requestsTableBody');
const cryptoAssets = [
    { key: 'btc', label: 'BTC' },
    { key: 'eth', label: 'ETH' },
    { key: 'ltc', label: 'LTC' },
    { key: 'doge', label: 'DOGE' }
];

function readStorage(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function renderUsers() {
    const users = readStorage(usersStorageKey);
    userCount.textContent = users.length;
    usersTableBody.replaceChildren();

    if (!users.length) {
        adminStatus.textContent = 'No accounts have been registered yet.';
        return;
    }

    adminStatus.textContent = 'Account details are stored in this browser for the prototype.';
    users.forEach((user) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const emailCell = document.createElement('td');
        const passwordCell = document.createElement('td');
        const dateCell = document.createElement('td');
        nameCell.textContent = user.name;
        emailCell.textContent = user.email;
        passwordCell.textContent = user.password || 'Not available';
        dateCell.textContent = new Date(user.createdAt).toLocaleString();
        row.append(nameCell, emailCell, passwordCell);
        cryptoAssets.forEach(({ key, label }) => {
            const balanceCell = document.createElement('td');
            balanceCell.className = 'balance-cell';
            balanceCell.innerHTML = `<strong>${formatCryptoAmount(user.cryptoBalances?.[key])} ${label}</strong><form class="balance-form" data-user-email="${encodeURIComponent(user.email)}" data-asset="${key}"><input type="number" name="amount" min="0.00000001" step="any" placeholder="Amount" required aria-label="${label} amount for ${user.email}"><button type="submit" name="action" value="increase" class="increase">Increase</button><button type="submit" name="action" value="reduce" class="reduce">Reduce</button></form>`;
            row.appendChild(balanceCell);
        });
        row.appendChild(dateCell);
        usersTableBody.appendChild(row);
    });
}

function formatCryptoAmount(value) {
    return (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function updateCryptoBalance(email, asset, action, amount) {
    const users = readStorage(usersStorageKey);
    const user = users.find((item) => item.email === email);
    if (!user) return;

    user.cryptoBalances = user.cryptoBalances && typeof user.cryptoBalances === 'object'
        ? user.cryptoBalances
        : {};
    const currentBalance = Number(user.cryptoBalances[asset]) || 0;
    user.cryptoBalances[asset] = Math.max(0, action === 'increase' ? currentBalance + amount : currentBalance - amount);
    addTransaction(user, {
        type: action === 'increase' ? 'deposit' : 'balance_adjustment',
        direction: action === 'increase' ? 'in' : 'out',
        asset: asset.toUpperCase(),
        amount,
        description: action === 'increase' ? 'Deposit' : 'Admin wallet debit',
        note: 'Completed',
        status: 'Completed'
    });
    localStorage.setItem(usersStorageKey, JSON.stringify(users));
    adminStatus.textContent = `${user.name}'s ${asset.toUpperCase()} balance is now ${formatCryptoAmount(user.cryptoBalances[asset])}.`;
    renderUsers();
}

function renderRequests() {
    const requests = readStorage(requestsStorageKey);
    requestsTableBody.replaceChildren();
    const pendingRequests = requests.filter((request) => request.status === 'pending');
    if (!pendingRequests.length) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="4">No pending requests.</td>';
        requestsTableBody.appendChild(row);
        return;
    }
    pendingRequests.forEach((request) => {
        const row = document.createElement('tr');
        const details = request.type === 'transaction'
            ? `${request.details.coin}, ${request.details.amount} to ${request.details.recipient}`
            : request.type === 'deposit'
                ? `${request.details.coin.toUpperCase()}, ${request.details.amount}`
                : request.details.type || request.details.name || request.details.asset;
        row.innerHTML = `<td>${request.userName}<br>${request.userEmail}</td><td>${request.type}</td><td>${details}</td><td class="request-actions"><button class="approve" data-request-action="approve" data-request-id="${request.id}">Approve</button><button class="reject" data-request-action="reject" data-request-id="${request.id}">Reject</button></td>`;
        requestsTableBody.appendChild(row);
    });
}

function updateRequest(requestId, status) {
    const requests = readStorage(requestsStorageKey);
    const request = requests.find((item) => item.id === requestId);
    if (!request || request.status !== 'pending') return;
    request.status = status;
    const users = readStorage(usersStorageKey);
    const user = users.find((item) => item.email === request.userEmail);
    if (user) {
        user.requests ||= [];
        const userRequest = user.requests.find((item) => item.id === requestId);
        if (userRequest) userRequest.status = status;
        if (status === 'approved') {
            if (request.type === 'card') {
                user.balance = (Number(user.balance) || 0) - cardFee;
                user.cards = [...(user.cards || []), { type: request.details.type, asset: request.details.asset, balance: 0, fee: cardFee, createdAt: new Date().toISOString() }];
                addTransaction(user, { type: 'card_fee', direction: 'out', asset: 'USD', amount: cardFee, description: 'Card activation fee', note: `${request.details.type} fee` });
            }
            if (request.type === 'deposit') {
                user.cryptoBalances ||= {};
                user.cryptoBalances[request.details.coin] = (Number(user.cryptoBalances[request.details.coin]) || 0) + Number(request.details.amount);
                addTransaction(user, { id: request.id, type: 'deposit', direction: 'in', asset: request.details.coin.toUpperCase(), amount: Number(request.details.amount), description: 'Wallet deposit', note: 'Admin-approved deposit' });
            }
            if (request.type === 'investment') user.investments = [...(user.investments || []), { name: request.details.name, amount: request.details.amount, createdAt: new Date().toISOString() }];
            if (request.type === 'transaction') addTransaction(user, { id: request.id, type: 'transfer', direction: 'out', asset: request.details.coin, amount: Number(request.details.amount), recipient: request.details.recipient, description: 'Crypto transfer', note: request.details.note || 'Sent crypto' });
        }
        localStorage.setItem(usersStorageKey, JSON.stringify(users));
    }
    localStorage.setItem(requestsStorageKey, JSON.stringify(requests));
    renderRequests();
    renderUsers();
}

requestsTableBody.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-request-action]');
    if (actionButton) updateRequest(actionButton.dataset.requestId, actionButton.dataset.requestAction === 'approve' ? 'approved' : 'rejected');
});

usersTableBody.addEventListener('submit', (event) => {
    const form = event.target.closest('.balance-form');
    if (!form) return;
    event.preventDefault();
    const amount = Number(new FormData(form).get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) return;
    updateCryptoBalance(decodeURIComponent(form.dataset.userEmail), form.dataset.asset, event.submitter.value, amount);
});

renderUsers();
renderRequests();

window.addEventListener('storage', (event) => {
    if (event.key === usersStorageKey) renderUsers();
    if (event.key === requestsStorageKey) renderRequests();
});
window.addEventListener('pageshow', () => {
    renderUsers();
    renderRequests();
});
