import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
const RED = '#e23744';
const DARK = '#1c1c1c';

function OwnerDashboard() {
  const [token, setToken] = useState(localStorage.getItem('ownerToken') || null);
  const [ownerInfo, setOwnerInfo] = useState(JSON.parse(localStorage.getItem('ownerInfo') || 'null'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  const [menuItems, setMenuItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', price: '', category: '' });
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ name: '', price: '', category: '' });

  const [tables, setTables] = useState([]);
  const [newTableNumber, setNewTableNumber] = useState('');

  const [staff, setStaff] = useState([]);
  const [newStaff, setNewStaff] = useState({ name: '', pin: '' });

  const handleLogin = async () => {
    setLoginError('');
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/owner/login`, { email, password });
      setToken(response.data.token);
      const info = {
        name: response.data.name,
        restaurantName: response.data.restaurantName,
        restaurantId: response.data.restaurantId,
      };
      setOwnerInfo(info);
      localStorage.setItem('ownerToken', response.data.token);
      localStorage.setItem('ownerInfo', JSON.stringify(info));
    } catch (err) {
      setLoginError('Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setOwnerInfo(null);
    localStorage.removeItem('ownerToken');
    localStorage.removeItem('ownerInfo');
  };

  const fetchDashboard = async () => {
    setError('');
    try {
      const [summaryRes, ordersRes] = await Promise.all([
        axios.get(`${API_URL}/owner/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/owner/dashboard/orders`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setSummary(summaryRes.data);
      setOrders(ordersRes.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Session expired or access denied. Please log in again.');
        handleLogout();
      } else {
        setError('Could not load dashboard.');
      }
    }
  };

  const fetchMenu = async () => {
    try {
      const response = await axios.get(`${API_URL}/owner/menu`, { headers: { Authorization: `Bearer ${token}` } });
      setMenuItems(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddItem = async () => {
    try {
      await axios.post(`${API_URL}/owner/menu`, {
        name: newItem.name,
        price: parseFloat(newItem.price),
        category: newItem.category,
        available: true,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewItem({ name: '', price: '', category: '' });
      fetchMenu();
    } catch (err) {
      setError('Could not add menu item.');
    }
  };

  const startEditing = (item) => {
    setEditingId(item.id);
    setEditValues({ name: item.name, price: String(item.price), category: item.category || '' });
  };

  const saveEdit = async (id) => {
    const price = parseFloat(editValues.price);
    if (!editValues.name.trim() || isNaN(price) || price <= 0) {
      setError('Please enter a name and a price above 0.');
      return;
    }
    try {
      await axios.put(`${API_URL}/owner/menu/${id}`, {
        name: editValues.name.trim(),
        price,
        category: editValues.category.trim(),
      }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingId(null);
      setError('');
      fetchMenu();
    } catch (err) {
      setError(`Could not save this item (${err.response?.status || err.message}).`);
    }
  };

  const toggleItem = async (item) => {
    try {
      await axios.put(`${API_URL}/owner/menu/${item.id}`, { available: !item.available },
        { headers: { Authorization: `Bearer ${token}` } });
      fetchMenu();
    } catch (err) {
      setError(`Could not update this item (${err.response?.status || err.message}).`);
    }
  };

  const fetchTables = async () => {
    try {
      const response = await axios.get(`${API_URL}/owner/tables`, { headers: { Authorization: `Bearer ${token}` } });
      setTables(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTable = async () => {
    try {
      await axios.post(`${API_URL}/owner/tables`, { tableNumber: parseInt(newTableNumber) }, { headers: { Authorization: `Bearer ${token}` } });
      setNewTableNumber('');
      fetchTables();
    } catch (err) {
      setError('Could not add table.');
    }
  };

  const fetchStaff = async () => {
    try {
      const response = await axios.get(`${API_URL}/owner/staff`, { headers: { Authorization: `Bearer ${token}` } });
      setStaff(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  const setTableOccupied = async (table, occupied) => {
    try {
      await axios.patch(`${API_URL}/owner/tables/${table.id}/occupied`, { occupied }, { headers: { Authorization: `Bearer ${token}` } });
      fetchTables();
    } catch (err) {
      setError(`Could not update this table (${err.response?.status || err.message}).`);
    }
  };

  const handleAddStaff = async () => {
    if (newStaff.pin.length !== 4) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    try {
      await axios.post(`${API_URL}/owner/staff`, newStaff, { headers: { Authorization: `Bearer ${token}` } });
      setNewStaff({ name: '', pin: '' });
      fetchStaff();
    } catch (err) {
      setError('Could not add staff member.');
    }
  };

  const updateAvailability = async (member, changes) => {
    try {
      await axios.patch(`${API_URL}/owner/staff/${member.id}/availability`, changes, { headers: { Authorization: `Bearer ${token}` } });
      fetchStaff();
    } catch (err) {
      setError('Could not update this chef.');
    }
  };

  const handleRemoveStaff = async (member) => {
    if (!window.confirm(`Remove ${member.name}? Their open orders will go to other chefs.`)) return;
    try {
      await axios.delete(`${API_URL}/owner/staff/${member.id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchStaff();
    } catch (err) {
      setError('Could not remove this staff member.');
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchDashboard();
    fetchMenu();
    fetchTables();
    fetchStaff();
    // Keep the numbers and chef workloads fresh without pressing Refresh
    const timer = setInterval(() => {
      fetchDashboard();
      fetchStaff();
      fetchTables();
    }, 5000);
    return () => clearInterval(timer);
  }, [token]);

  const statusColor = (status) => {
    if (status === 'PENDING') return { bg: '#fff4e6', color: '#e67e22' };
    if (status === 'PREPARING') return { bg: '#e8f1fc', color: '#2980b9' };
    if (status === 'READY') return { bg: '#f3e8fc', color: '#8e44ad' };
    if (status === 'SERVED') return { bg: '#e9f9ee', color: '#27ae60' };
    return { bg: '#eee', color: '#888' };
  };

  const pageStyle = { fontFamily: "'Poppins', sans-serif", background: '#f6f6f6', minHeight: '100vh' };
  const topBar = { background: DARK, color: 'white', padding: '18px 20px', fontSize: '22px', fontWeight: 700 };

  // Login screen
  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={topBar}>🏠 Owner Portal</div>
        <div style={{ maxWidth: '360px', margin: '80px auto', padding: '0 16px' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <h1 style={{ fontSize: '20px', margin: '0 0 6px', color: DARK }}>Owner Login</h1>
            <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px' }}>Manage your restaurant</p>

            <label style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '12px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '8px', margin: '6px 0 16px', boxSizing: 'border-box', background: 'white', color: DARK }}
            />

            <label style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '12px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '8px', margin: '6px 0 20px', boxSizing: 'border-box', background: 'white', color: DARK }}
            />

            {loginError && <p style={{ color: RED, fontSize: '13px' }}>{loginError}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700, background: RED, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div style={pageStyle}>
      <div style={{ ...topBar, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          🏠 {ownerInfo?.restaurantName || 'Owner Portal'}
          <div style={{ fontSize: '13px', fontWeight: 400, color: '#ccc', marginTop: '2px' }}>
            Welcome, {ownerInfo?.name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { fetchDashboard(); fetchMenu(); fetchTables(); fetchStaff(); }} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, background: '#333', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            ⟳ Refresh
          </button>
          <button onClick={handleLogout} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, background: RED, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
        {error && <p style={{ color: RED }}>{error}</p>}

        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '28px' }}>
            <div style={{ background: 'white', borderRadius: '12px', padding: '18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '12px', color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Total Orders</div>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px' }}>{summary.totalOrders}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '12px', color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Revenue</div>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px' }}>Rs. {summary.totalRevenue}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '12px', color: '#e67e22', fontWeight: 600, textTransform: 'uppercase' }}>Pending</div>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px' }}>{summary.pendingCount}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '12px', color: '#2980b9', fontWeight: 600, textTransform: 'uppercase' }}>Preparing</div>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px' }}>{summary.preparingCount}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '12px', color: '#27ae60', fontWeight: 600, textTransform: 'uppercase' }}>Served</div>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px' }}>{summary.servedCount}</div>
            </div>
          </div>
        )}

        {/* MENU MANAGEMENT */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 14px' }}>Add Menu Item</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} style={{ flex: '1 1 150px', padding: '10px', border: '1px solid #ddd', borderRadius: '8px' }} />
            <input placeholder="Price" type="number" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} style={{ flex: '1 1 100px', padding: '10px', border: '1px solid #ddd', borderRadius: '8px' }} />
            <input placeholder="Category" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} style={{ flex: '1 1 130px', padding: '10px', border: '1px solid #ddd', borderRadius: '8px' }} />
            <button onClick={handleAddItem} style={{ padding: '10px 20px', background: RED, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        <h2 style={{ fontSize: '16px', marginBottom: '12px' }}>Your Menu</h2>
        {menuItems.length === 0 && <p style={{ color: '#888' }}>No menu items yet.</p>}
        {menuItems.map((item) => (
          <div key={item.id} style={{ background: 'white', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', opacity: item.available ? 1 : 0.6 }}>
            {editingId === item.id ? (
              <div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <input value={editValues.name} onChange={(e) => setEditValues({ ...editValues, name: e.target.value })} style={{ flex: '1 1 140px', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} />
                  <input type="number" value={editValues.price} onChange={(e) => setEditValues({ ...editValues, price: e.target.value })} style={{ flex: '1 1 80px', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} />
                  <input value={editValues.category} onChange={(e) => setEditValues({ ...editValues, category: e.target.value })} style={{ flex: '1 1 110px', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <button onClick={() => saveEdit(item.id)} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginRight: '8px' }}>Save</button>
                <button onClick={() => setEditingId(null)} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, background: '#eee', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <strong>{item.name}</strong> — Rs. {item.price}
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    {item.category} · <span style={{ fontWeight: 700, color: item.available ? '#27ae60' : '#e67e22' }}>{item.available ? 'Visible to customers' : 'Hidden'}</span>
                  </div>
                </div>
                <div>
                  <button onClick={() => startEditing(item)} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, background: '#2980b9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginRight: '6px' }}>Edit</button>
                  <button onClick={() => toggleItem(item)} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, background: item.available ? '#e67e22' : '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{item.available ? 'Hide' : 'Show'}</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ENTRANCE QR CODE: one per restaurant, guests then type their own table number */}
        {(() => {
          const entranceUrl = `${window.location.origin}/?restaurantId=${ownerInfo?.restaurantId}`;
          const entranceQr = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(entranceUrl)}`;
          return (
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', margin: '28px 0 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={entranceQr} alt="Entrance QR code" style={{ width: '180px', height: '180px', borderRadius: '8px' }} />
              <div style={{ flex: '1 1 220px' }}>
                <h2 style={{ fontSize: '16px', margin: '0 0 8px' }}>Entrance QR Code</h2>
                <p style={{ fontSize: '13px', color: '#666', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Print this and put it at your entrance. Guests scan it, type their table number and name, and order.
                </p>
                <div style={{ fontSize: '12px', color: '#888', wordBreak: 'break-all', marginBottom: '10px' }}>{entranceUrl}</div>
                <a href={entranceQr} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: RED, textDecoration: 'none', fontWeight: 700 }}>Open large image to print or save</a>
              </div>
            </div>
          );
        })()}

        {/* TABLE MANAGEMENT + QR CODES */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', margin: '28px 0 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 14px' }}>Add Table</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input placeholder="Table number" type="number" value={newTableNumber} onChange={(e) => setNewTableNumber(e.target.value)} style={{ flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: '8px' }} />
            <button onClick={handleAddTable} style={{ padding: '10px 20px', background: RED, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        <h2 style={{ fontSize: '16px', marginBottom: '6px' }}>Your Tables</h2>
        <div style={{ fontSize: '14px', marginBottom: '12px' }}>
          <span style={{ color: '#27ae60', fontWeight: 700 }}>{tables.filter((t) => !t.isOccupied).length} free</span>
          <span style={{ color: '#aaa' }}> · </span>
          <span style={{ color: '#e67e22', fontWeight: 700 }}>{tables.filter((t) => t.isOccupied).length} occupied</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px', marginBottom: '28px' }}>
          {tables.map((table) => {
            const qrUrl = `${window.location.origin}/?restaurantId=${ownerInfo?.restaurantId}&table=${table.tableNumber}`;
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}`;
            return (
              <div key={table.id} style={{ background: 'white', borderRadius: '10px', padding: '14px', textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                <img src={qrImageUrl} alt={`QR for table ${table.tableNumber}`} style={{ width: '100%', borderRadius: '6px' }} />
                <div style={{ fontWeight: 700, marginTop: '8px' }}>Table {table.tableNumber}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: table.isOccupied ? '#e67e22' : '#27ae60', margin: '2px 0 6px' }}>
                  {table.isOccupied ? 'Occupied' : 'Free'}
                </div>
                <button onClick={() => setTableOccupied(table, !table.isOccupied)} style={{ padding: '4px 10px', fontSize: '12px', fontWeight: 600, background: table.isOccupied ? '#27ae60' : '#e67e22', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '6px' }}>
                  {table.isOccupied ? 'Mark free' : 'Mark occupied'}
                </button><br />
                <a href={qrImageUrl} download={`table-${table.tableNumber}-qr.png`} style={{ fontSize: '12px', color: RED, textDecoration: 'none', fontWeight: 600 }}>Download</a>
              </div>
            );
          })}
        </div>

        {/* STAFF MANAGEMENT */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 14px' }}>Add Kitchen Staff</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input placeholder="Staff name" value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} style={{ flex: '1 1 160px', padding: '10px', border: '1px solid #ddd', borderRadius: '8px' }} />
            <input placeholder="4-digit PIN" maxLength="4" value={newStaff.pin} onChange={(e) => setNewStaff({ ...newStaff, pin: e.target.value })} style={{ flex: '1 1 120px', padding: '10px', border: '1px solid #ddd', borderRadius: '8px' }} />
            <button onClick={handleAddStaff} style={{ padding: '10px 20px', background: RED, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        <h2 style={{ fontSize: '16px', marginBottom: '12px' }}>Your Staff</h2>
        {staff.length === 0 && <p style={{ color: '#888' }}>No staff added yet.</p>}
        {staff.map((member) => (
          <div key={member.id} style={{ background: 'white', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <strong>{member.name}</strong>
              <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 700, color: member.offline ? '#e67e22' : '#27ae60' }}>
                {member.offline ? '● Offline' : '● Online'}
              </span>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                Working on {member.activeOrders} of {member.maxConcurrentOrders} orders
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => updateAvailability(member, { maxConcurrentOrders: member.maxConcurrentOrders - 1 })}
                disabled={member.maxConcurrentOrders <= 1}
                title="Fewer orders at once"
                style={{ width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${RED}`, background: 'white', color: RED, fontWeight: 700, cursor: 'pointer' }}
              >−</button>
              <span style={{ fontSize: '12px', color: '#555', minWidth: '48px', textAlign: 'center' }}>Capacity {member.maxConcurrentOrders}</span>
              <button
                onClick={() => updateAvailability(member, { maxConcurrentOrders: member.maxConcurrentOrders + 1 })}
                title="More orders at once"
                style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: RED, color: 'white', fontWeight: 700, cursor: 'pointer' }}
              >+</button>
              <button
                onClick={() => updateAvailability(member, { offline: !member.offline })}
                style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, background: member.offline ? '#27ae60' : DARK, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                {member.offline ? 'Go online' : 'Go offline'}
              </button>
              <button
                onClick={() => handleRemoveStaff(member)}
                style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, background: 'white', color: RED, border: `1px solid ${RED}`, borderRadius: '6px', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        <h2 style={{ fontSize: '16px', marginBottom: '12px', marginTop: '28px' }}>Recent Orders</h2>
        {orders.length === 0 && <p style={{ color: '#888' }}>No orders yet.</p>}

        {orders.map((order) => {
          const s = statusColor(order.status);
          return (
            <div key={order.id} style={{ background: 'white', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Order #{order.id}</strong> — {order.tableSession?.orderType === 'TAKEAWAY' ? `🥡 Takeaway · Token #${order.tokenNumber}` : `Table ${order.tableSession?.tableNumber}`}
                <div style={{ fontSize: '12px', color: '#888' }}>
                  {order.tableSession?.customerName} · Rs. {order.totalAmount}
                </div>
              </div>
              <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                {order.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OwnerDashboard;
