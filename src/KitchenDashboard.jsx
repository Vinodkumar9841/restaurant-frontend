import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

// Short two-tone chime (browsers only allow sound after the user has clicked something)
let audioCtx = null;
function playBeep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [880, 1175].forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(audioCtx.destination);
      const start = audioCtx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.25, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      o.start(start);
      o.stop(start + 0.4);
    });
  } catch (e) {
    // no sound available: ignore
  }
}

const RED = '#e23744';
const DARK = '#1c1c1c';

// Reads the chef's name from the login token (the middle part of a JWT)
function getChefNameFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub;
  } catch (err) {
    return null;
  }
}

function KitchenDashboard() {
  const [token, setToken] = useState(localStorage.getItem('kitchenToken') || null);
  const [pin, setPin] = useState('');
  const [restaurantIdInput, setRestaurantIdInput] = useState(
    new URLSearchParams(window.location.search).get('restaurantId') || '1'
  );
  const [loginError, setLoginError] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('mine');
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  const knownIds = useRef(null);

  const chefName = token ? getChefNameFromToken(token) : null;

  const handleLogin = async () => {
    setLoginError('');
    try {
      const response = await axios.post(`${API_URL}/kitchen/login`, {
        pin,
        restaurantId: parseInt(restaurantIdInput),
      });
      setToken(response.data.token);
      localStorage.setItem('kitchenToken', response.data.token);
      setTab('mine');
    } catch (err) {
      setLoginError('Incorrect PIN or restaurant ID. Please try again.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setOrders([]);
    localStorage.removeItem('kitchenToken');
  };

  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_URL}/orders/kitchen`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = response.data.sort((a, b) => b.id - a.id);
      // Chime when an order appears that we have not seen before
      if (knownIds.current && soundRef.current && list.some((o) => !knownIds.current.has(o.id) && o.status === 'PENDING')) {
        playBeep();
      }
      knownIds.current = new Set(list.map((o) => o.id));
      setOrders(list);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Session expired. Please log in again.');
        handleLogout();
      } else {
        setError('Could not load orders.');
      }
    } finally {
      setLoading(false);
    }
  };

  // New orders and chef changes show up automatically every 3 seconds
  useEffect(() => {
    if (!token) return;
    fetchOrders();
    const timer = setInterval(fetchOrders, 3000);
    return () => clearInterval(timer);
  }, [token]);

  const updateStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`${API_URL}/orders/${orderId}/status`, { status: newStatus }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchOrders();
    } catch (err) {
      setError('Could not update order status.');
    }
  };

  const statusStyle = (status) => {
    if (status === 'PENDING') return { bg: '#fff4e6', color: '#e67e22' };
    if (status === 'PREPARING') return { bg: '#e8f1fc', color: '#2980b9' };
    if (status === 'READY') return { bg: '#f3e8fc', color: '#8e44ad' };
    if (status === 'SERVED') return { bg: '#e9f9ee', color: '#27ae60' };
    return { bg: '#eee', color: '#888' };
  };

  // Sort the orders into the three tabs
  const isMine = (o) => o.assignedChef && o.assignedChef.name === chefName;
  const isWaiting = (o) => !o.assignedChef && o.status !== 'SERVED' && o.status !== 'READY';
  const mineOrders = orders.filter(isMine);
  const waitingOrders = orders.filter(isWaiting);
  const visibleOrders = tab === 'mine' ? mineOrders : tab === 'waiting' ? waitingOrders : orders;

  const emptyMessage =
    tab === 'mine' ? 'No orders assigned to you right now.'
    : tab === 'waiting' ? 'No orders are waiting for a chef.'
    : 'No orders yet.';

  const pageStyle = { fontFamily: "'Poppins', sans-serif", background: '#f6f6f6', minHeight: '100vh' };
  const topBar = { background: DARK, color: 'white', padding: '18px 20px', fontSize: '22px', fontWeight: 700 };

  const tabButton = (key, label, count) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      style={{
        flex: 1, padding: '10px 8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        border: 'none', borderRadius: '8px',
        background: tab === key ? RED : 'white',
        color: tab === key ? 'white' : DARK,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      {label} ({count})
    </button>
  );

  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={topBar}>👨‍🍳 Kitchen Dashboard</div>
        <div style={{ maxWidth: '340px', margin: '80px auto', padding: '0 16px' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <h1 style={{ fontSize: '20px', margin: '0 0 6px', color: DARK }}>Staff Login</h1>
            <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px' }}>Enter your restaurant ID and 4-digit PIN</p>
            <input
              type="number"
              placeholder="Restaurant ID"
              value={restaurantIdInput}
              onChange={(e) => setRestaurantIdInput(e.target.value)}
              style={{ width: '100%', padding: '12px', fontSize: '14px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', background: 'white', color: DARK, marginBottom: '12px' }}
            />
            <input
              type="password"
              maxLength="4"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              style={{ width: '100%', padding: '12px', fontSize: '22px', textAlign: 'center', letterSpacing: '10px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', background: 'white', color: DARK }}
            />
            {loginError && <p style={{ color: RED, fontSize: '13px', marginTop: '10px' }}>{loginError}</p>}
            <button
              onClick={handleLogin}
              style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700, background: RED, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '16px' }}
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ ...topBar, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          👨‍🍳 {chefName || 'Kitchen'}
          <div style={{ fontSize: '12px', fontWeight: 500, color: '#aaa', marginTop: '2px' }}>
            Updates automatically every 3 seconds
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { const next = !soundOn; setSoundOn(next); soundRef.current = next; if (next) playBeep(); }}
            style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, background: soundOn ? '#27ae60' : '#555', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            {soundOn ? '🔔 Sound on' : '🔕 Sound off'}
          </button>
          <button onClick={fetchOrders} disabled={loading} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, background: '#333', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            {loading ? '...' : '⟳ Refresh'}
          </button>
          <button onClick={handleLogout} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, background: RED, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
          {tabButton('mine', 'My orders', mineOrders.length)}
          {tabButton('waiting', 'Waiting', waitingOrders.length)}
          {tabButton('all', 'All', orders.length)}
        </div>

        {error && <p style={{ color: RED }}>{error}</p>}
        {visibleOrders.length === 0 && !loading && <p style={{ color: '#888' }}>{emptyMessage}</p>}

        {visibleOrders.map((order) => {
          const s = statusStyle(order.status);
          return (
            <div key={order.id} style={{ background: 'white', borderRadius: '12px', padding: '18px', marginBottom: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: DARK }}>Order #{order.id} — {order.tableSession?.orderType === 'TAKEAWAY' ? `🥡 TAKEAWAY · Token #${order.tokenNumber}` : `Table ${order.tableSession?.tableNumber}`}</div>
                  <div style={{ fontSize: '13px', color: '#888', margin: '4px 0' }}>
                    {order.tableSession?.customerName}{order.tableSession?.orderType === 'TAKEAWAY' && order.tableSession?.customerPhone ? ` · 📞 ${order.tableSession.customerPhone}` : ''} · Rs. {order.totalAmount}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: order.assignedChef ? '#2980b9' : '#e67e22' }}>
                    {order.assignedChef
                      ? (isMine(order) ? 'Assigned to you' : `Chef: ${order.assignedChef.name}`)
                      : 'Waiting for a chef'}
                  </div>
                </div>
                <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                  {order.status}
                </span>
              </div>

              <div style={{ marginTop: '12px' }}>
                {order.status === 'PENDING' && (
                  <button onClick={() => updateStatus(order.id, 'PREPARING')} style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, background: '#2980b9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    Start Preparing
                  </button>
                )}
                {order.status === 'PREPARING' && (
                  <button onClick={() => updateStatus(order.id, order.tableSession?.orderType === 'TAKEAWAY' ? 'READY' : 'SERVED')} style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    {order.tableSession?.orderType === 'TAKEAWAY' ? 'Mark Ready for pickup' : 'Mark Served'}
                  </button>
                )}
                {order.status === 'READY' && (
                  <button onClick={() => updateStatus(order.id, 'SERVED')} style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, background: '#8e44ad', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    Handed over to customer
                  </button>
                )}
                {order.status === 'SERVED' && <span style={{ color: '#27ae60', fontWeight: 700, fontSize: '13px' }}>✓ Completed</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default KitchenDashboard;
