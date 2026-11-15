import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
const RED = '#e23744';
const DARK = '#1c1c1c';

// Read the restaurant and table from the QR link, e.g. /?restaurantId=2&table=3
const urlParams = new URLSearchParams(window.location.search);
const RESTAURANT_ID = parseInt(urlParams.get('restaurantId')) || 1;
const TABLE_FROM_LINK = urlParams.get('table') || '';

function App() {
  const [session, setSession] = useState(null);
  const [tableNumber, setTableNumber] = useState(TABLE_FROM_LINK);
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState('DINE_IN');
  const [customerPhone, setCustomerPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiOpen, setUpiOpen] = useState(false);
  const [tabOpen, setTabOpen] = useState(false);
  const [tab, setTab] = useState(null);
  const [splitCount, setSplitCount] = useState(1);
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState({});
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Recommendations: best sellers, plus items that other customers ordered with what is in the cart
  const [recs, setRecs] = useState({ popular: [], pairings: [] });
  const cartKey = Object.keys(cart).sort().join(',');
  useEffect(() => {
    if (!session) return;
    const loadRecs = async () => {
      try {
        const response = await axios.get(`${API_URL}/public/restaurants/${RESTAURANT_ID}/recommendations`, {
          params: cartKey ? { cart: cartKey } : {},
        });
        setRecs(response.data);
      } catch (err) {
        console.error(err);
      }
    };
    loadRecs();
  }, [session, cartKey]);

  // AI menu assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  useEffect(() => {
    axios.get(`${API_URL}/public/restaurants/${RESTAURANT_ID}/assistant/status`)
      .then((res) => setAiEnabled(res.data.enabled === true))
      .catch(() => setAiEnabled(false));
  }, []);
  const [aiInput, setAiInput] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [aiItems, setAiItems] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  const askAssistant = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiReply('');
    setAiItems([]);
    try {
      const response = await axios.post(`${API_URL}/public/restaurants/${RESTAURANT_ID}/assistant`, { message: aiInput });
      setAiReply(response.data.reply);
      setAiItems(response.data.items || []);
    } catch (err) {
      setAiReply(err.response?.data?.message || 'The assistant is not available right now.');
    } finally {
      setAiLoading(false);
    }
  };

  // Free / occupied tables (shown when the guest scanned the entrance QR code)
  const [tables, setTables] = useState([]);
  const loadTables = async () => {
    try {
      const response = await axios.get(`${API_URL}/public/restaurants/${RESTAURANT_ID}/tables`);
      setTables(response.data.tables || []);
    } catch (err) {
      console.error(err);
    }
  };
  useEffect(() => {
    if (session) return;
    loadTables();
    const timer = setInterval(loadTables, 5000);
    return () => clearInterval(timer);
  }, [session]);

  // Find out which restaurant this link belongs to
  useEffect(() => {
    const loadRestaurant = async () => {
      try {
        const response = await axios.get(`${API_URL}/public/restaurants/${RESTAURANT_ID}`);
        setRestaurantName(response.data.name);
        setUpiId(response.data.upiId || '');
      } catch (err) {
        setError('We could not find this restaurant. Please scan the QR code again.');
      }
    };
    loadRestaurant();
  }, []);

  const handleLogin = async () => {
    const takeaway = orderType === 'TAKEAWAY' && !TABLE_FROM_LINK;
    if (takeaway) {
      if (!customerName || customerPhone.replace(/\D/g, '').length < 10) {
        setError('Please enter your name and a 10-digit phone number');
        return;
      }
    } else if (!tableNumber || !customerName) {
      setError('Please choose your table and enter your name');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Guest chose a table from the list: take it, unless someone else just did
      if (!takeaway && !TABLE_FROM_LINK && tables.length > 0) {
        try {
          await axios.post(`${API_URL}/public/restaurants/${RESTAURANT_ID}/tables/${tableNumber}/claim`);
        } catch (claimErr) {
          if (claimErr.response?.status === 409) {
            setError('Sorry, this table was just taken. Please pick another one.');
            setTableNumber('');
            loadTables();
            return;
          }
        }
      }
      const response = await axios.post(`${API_URL}/session`, {
        orderType: takeaway ? 'TAKEAWAY' : 'DINE_IN',
        tableNumber: takeaway ? null : parseInt(tableNumber),
        customerName: customerName,
        customerPhone: takeaway ? customerPhone : null,
        restaurantId: RESTAURANT_ID,
      });
      setSession(response.data);
      fetchMenu();
      // Guest scanned the QR stuck on a table: mark that table occupied
      if (!takeaway && TABLE_FROM_LINK) {
        axios.post(`${API_URL}/public/restaurants/${RESTAURANT_ID}/tables/${tableNumber}/claim`, null, { params: { force: true } }).catch(() => {});
      }
    } catch (err) {
      setError('Something went wrong. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  // Table tab: everything this guest has ordered, refreshed while the panel is open
  const loadTab = async () => {
    if (!session) return;
    try {
      const response = await axios.get(`${API_URL}/public/sessions/${session.id}/tab`, { params: { key: session.accessKey } });
      setTab(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!tabOpen || !session) return;
    loadTab();
    const timer = setInterval(loadTab, 4000);
    return () => clearInterval(timer);
  }, [tabOpen, session?.id]);

  // "Call waiter": tell the owner this table needs help
  const callWaiter = async () => {
    if (waiterCalled) return;
    try {
      await axios.post(`${API_URL}/public/sessions/${session.id}/call-waiter`, null, { params: { key: session.accessKey } });
      setWaiterCalled(true);
      setTimeout(() => setWaiterCalled(false), 90000);
    } catch (err) {
      setError('Could not call the waiter. Please wave to a staff member.');
    }
  };

  const requestBill = async () => {
    try {
      await axios.post(`${API_URL}/public/sessions/${session.id}/request-bill`, null, { params: { key: session.accessKey } });
      loadTab();
    } catch (err) {
      setError('Could not request the bill. Please call a staff member.');
    }
  };

  // The owner has taken payment, so the table is already free: just leave
  const finishAfterPayment = () => {
    setTabOpen(false);
    setTab(null);
    setOrder(null);
    setCart({});
    setSession(null);
    setTableNumber(TABLE_FROM_LINK);
  };

  // Guest tapped "I'm done": free the table and return to the welcome screen
  const handleDone = async () => {
    if (!window.confirm("Leaving? This frees your table for the next guest.")) return;
    try {
      if (session?.orderType !== 'TAKEAWAY' && session?.tableNumber) {
        await axios.post(`${API_URL}/public/restaurants/${RESTAURANT_ID}/tables/${session.tableNumber}/release`);
      }
    } catch (err) {
      console.error(err);
    }
    setOrder(null);
    setCart({});
    setSession(null);
    setTableNumber(TABLE_FROM_LINK);
  };

  const fetchMenu = async () => {
    try {
      const response = await axios.get(`${API_URL}/menu`, { params: { restaurantId: RESTAURANT_ID } });
      setMenuItems(response.data.filter((item) => item.available !== false));
    } catch (err) {
      console.error(err);
    }
  };

  const addToCart = (itemId) => {
    setCart((prev) => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
  };

  const removeFromCart = (itemId) => {
    setCart((prev) => {
      const newCart = { ...prev };
      if (newCart[itemId] > 1) newCart[itemId] -= 1;
      else delete newCart[itemId];
      return newCart;
    });
  };

  const calculateTotal = () => {
    let total = 0;
    for (const itemId in cart) {
      const item = menuItems.find((m) => m.id === parseInt(itemId));
      if (item) total += item.price * cart[itemId];
    }
    return total.toFixed(2);
  };

  const cartItemCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  const handlePlaceOrder = async () => {
    if (cartItemCount === 0) {
      setError('Please add at least one item before placing an order');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const totalAmount = parseFloat(calculateTotal());

      const paymentResponse = await axios.post(`${API_URL}/payments`, {
        tableSessionId: session.id,
        amount: totalAmount,
      });

      const { razorpayOrderId, amount, currency, razorpayKeyId } = paymentResponse.data;

      const options = {
        key: razorpayKeyId,
        amount: amount,
        currency: currency,
        name: restaurantName || 'TableServe',
        description: session.orderType === 'TAKEAWAY' ? 'Takeaway order' : `Table ${session.tableNumber} order`,
        order_id: razorpayOrderId,
        handler: async function (response) {
          try {
            const verifyResponse = await axios.post(`${API_URL}/payments/verify`, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (!verifyResponse.data.verified) {
              setError('Payment verification failed. Please try again.');
              setLoading(false);
              return;
            }

            const items = Object.entries(cart).map(([menuItemId, quantity]) => ({
              menuItemId: parseInt(menuItemId),
              quantity,
            }));

            const orderResponse = await axios.post(`${API_URL}/orders`, {
              tableSessionId: session.id,
              paymentId: verifyResponse.data.paymentId,
              paymentMode: 'ONLINE',
              items,
            });

            setOrder(orderResponse.data);
            setCart({});
          } catch (err) {
            setError('Something went wrong after payment. Please contact staff.');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            setError('Payment was cancelled.');
          },
        },
        theme: { color: '#e23744' },
      };

      const razorpayCheckout = new window.Razorpay(options);
      razorpayCheckout.open();
    } catch (err) {
      setError('Could not start payment. Please try again.');
      setLoading(false);
    }
  };

  // mode is CASH (pay at counter) or UPI (guest paid the restaurant's UPI QR)
  const handlePayCash = async (mode = 'CASH') => {
    if (cartItemCount === 0) {
      setError('Please add at least one item before placing an order');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const totalAmount = parseFloat(calculateTotal());

      const paymentResponse = await axios.post(`${API_URL}/payments/cash`, {
        tableSessionId: session.id,
        amount: totalAmount,
      });

      const items = Object.entries(cart).map(([menuItemId, quantity]) => ({
        menuItemId: parseInt(menuItemId),
        quantity,
      }));

      const orderResponse = await axios.post(`${API_URL}/orders`, {
        tableSessionId: session.id,
        paymentId: paymentResponse.data.paymentId,
        paymentMode: mode,
        items,
      });

      setOrder(orderResponse.data);
      setCart({});
    } catch (err) {
      setError('Could not place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!order) return;
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_URL}/orders/${order.id}`, { params: { key: session?.accessKey } });
        setOrder(response.data);
      } catch (err) {
        console.error(err);
      }
    }, 3000);
    if (order.status === 'SERVED' || (order.status === 'READY' && session?.orderType === 'TAKEAWAY')) clearInterval(interval);
    return () => clearInterval(interval);
  }, [order]);

  const statusStep = (status) => {
    if (status === 'PENDING') return 1;
    if (status === 'PREPARING') return 2;
    if (status === 'SERVED' || status === 'READY') return 3;
    return 0;
  };

  const categoryEmoji = (category) => {
    if (category === 'Burgers') return '🍔';
    if (category === 'Starters') return '🍢';
    if (category === 'Beverages') return '🥤';
    return '🍽️';
  };

  const pageStyle = {
    fontFamily: "'Poppins', sans-serif",
    background: '#f6f6f6',
    minHeight: '100vh',
  };

  const topBar = {
    background: DARK,
    color: 'white',
    padding: '18px 20px',
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  };

  const brand = `🍴 ${restaurantName || 'TableServe'}`;

  const tabPanel = tabOpen && session ? (() => {
    const total = tab ? Number(tab.total) : 0;
    const people = Math.max(1, splitCount);
    const share = (total / people).toFixed(2);
    const upiLink = upiId ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(restaurantName || 'Restaurant')}&am=${share}&cu=INR&tn=${encodeURIComponent('Table bill')}` : '';
    const qr = upiLink ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}` : '';
    const chip = (st) => ({ PENDING: '#e67e22', PREPARING: '#2980b9', READY: '#8e44ad', SERVED: '#27ae60' }[st] || '#888');
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60 }}>
        <div style={{ background: 'white', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: DARK }}>🧾 Your Tab · Table {session.tableNumber}</h2>
            <button onClick={() => setTabOpen(false)} style={{ background: '#eee', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontSize: '14px' }}>✕</button>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#999' }}>Order as often as you like. Pay once at the end.</p>

          {!tab && <p style={{ color: '#888' }}>Loading...</p>}
          {tab && tab.orders.length === 0 && <p style={{ color: '#888' }}>Nothing ordered yet.</p>}
          {tab && tab.orders.map((o) => (
            <div key={o.id} style={{ border: '1px solid #eee', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <strong>Order #{o.id}</strong>
                <span style={{ fontWeight: 700, color: chip(o.status) }}>{o.status}</span>
              </div>
              {o.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#444' }}>
                  <span>{it.quantity} × {it.name}</span>
                  <span>Rs. {Number(it.lineTotal).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}

          {tab && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '17px', fontWeight: 800, color: DARK, margin: '14px 0' }}>
              <span>Total</span><span>Rs. {total.toFixed(2)}</span>
            </div>
          )}

          {tab && tab.settled && (
            <div style={{ textAlign: 'center', background: '#e9f9ee', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '28px' }}>✅</div>
              <div style={{ fontWeight: 700, color: '#27ae60' }}>Paid ({tab.settledMethod}). Thank you!</div>
              <button onClick={finishAfterPayment} style={{ marginTop: '12px', padding: '11px 28px', background: DARK, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Finish</button>
            </div>
          )}

          {tab && !tab.settled && tab.orders.length > 0 && (
            <>
              <div style={{ background: '#f7f5fb', borderRadius: '12px', padding: '12px', margin: '6px 0 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: DARK }}>Split equally between</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => setSplitCount(Math.max(1, splitCount - 1))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${RED}`, background: 'white', color: RED, fontWeight: 700, cursor: 'pointer' }}>−</button>
                    <strong>{people}</strong>
                    <button onClick={() => setSplitCount(Math.min(12, splitCount + 1))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: RED, color: 'white', fontWeight: 700, cursor: 'pointer' }}>+</button>
                  </span>
                </div>
                {people > 1 && <div style={{ marginTop: '8px', fontSize: '14px', color: DARK }}>Each person pays <strong>Rs. {share}</strong></div>}
              </div>

              {!tab.billRequested ? (
                <button onClick={requestBill} style={{ width: '100%', padding: '14px', background: RED, color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>
                  Request bill
                </button>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ background: '#fff4e6', color: '#e67e22', borderRadius: '10px', padding: '10px', fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>
                    Bill requested. Staff are on the way.
                  </div>
                  {upiId && (
                    <>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>Prefer UPI? Scan to pay {people > 1 ? 'your share' : 'the bill'} (Rs. {share})</div>
                      <img src={qr} alt="UPI QR" style={{ width: '170px', height: '170px' }} />
                      <a href={upiLink} style={{ display: 'block', marginTop: '8px', padding: '10px', background: DARK, color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '13px' }}>Open UPI app</a>
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>After paying, show your screen to the staff.</div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  })() : null;

  if (!session) {
    return (
      <div style={pageStyle}>
        <div style={topBar}>{brand}</div>
        <div style={{ maxWidth: '380px', margin: '50px auto', padding: '0 16px' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <h1 style={{ fontSize: '24px', margin: '0 0 6px', color: DARK }}>
              {restaurantName ? `Welcome to ${restaurantName} 👋` : 'Welcome 👋'}
            </h1>
            <p style={{ color: '#888', fontSize: '14px', margin: '0 0 20px' }}>{orderType === 'TAKEAWAY' && !TABLE_FROM_LINK ? 'Order ahead and pick it up' : 'Enter your table details to see the menu'}</p>

            {!TABLE_FROM_LINK && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                {[['DINE_IN', '🍽️ Dine-in'], ['TAKEAWAY', '🥡 Takeaway']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => { setOrderType(val); setError(''); }}
                    style={{ flex: 1, padding: '11px', fontSize: '14px', fontWeight: 600, borderRadius: '8px', cursor: 'pointer',
                      border: orderType === val ? `2px solid ${RED}` : '1px solid #ddd',
                      background: orderType === val ? RED : 'white', color: orderType === val ? 'white' : DARK }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {orderType === 'TAKEAWAY' && !TABLE_FROM_LINK ? null : !TABLE_FROM_LINK && tables.length > 0 ? (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>Choose your table</label>
                <div style={{ fontSize: '13px', margin: '6px 0 10px' }}>
                  <span style={{ color: '#27ae60', fontWeight: 700 }}>{tables.filter((t) => !t.occupied).length} free</span>
                  <span style={{ color: '#aaa' }}> · </span>
                  <span style={{ color: '#e67e22', fontWeight: 700 }}>{tables.filter((t) => t.occupied).length} occupied</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '8px' }}>
                  {tables.map((t) => {
                    const selected = String(tableNumber) === String(t.tableNumber);
                    return (
                      <button
                        key={t.tableNumber}
                        disabled={t.occupied}
                        onClick={() => setTableNumber(String(t.tableNumber))}
                        style={{
                          padding: '10px 4px', fontSize: '15px', fontWeight: 700, borderRadius: '8px',
                          cursor: t.occupied ? 'not-allowed' : 'pointer',
                          border: selected ? `2px solid ${RED}` : t.occupied ? '1px solid #ddd' : '1px solid #27ae60',
                          background: selected ? RED : t.occupied ? '#f0f0f0' : 'white',
                          color: selected ? 'white' : t.occupied ? '#aaa' : '#27ae60',
                        }}
                      >
                        {t.tableNumber}
                        <div style={{ fontSize: '10px', fontWeight: 600 }}>{t.occupied ? 'Occupied' : selected ? 'Selected' : 'Free'}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>Table Number</label>
                <input
                  type="number"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  style={{ width: '100%', padding: '12px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '8px', margin: '6px 0 16px', boxSizing: 'border-box', background: 'white', color: DARK }}
                />
              </>
            )}

            <label style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>Your Name</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={{ width: '100%', padding: '12px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '8px', margin: '6px 0 20px', boxSizing: 'border-box', background: 'white', color: DARK }}
            />

            {orderType === 'TAKEAWAY' && !TABLE_FROM_LINK && (
              <>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>Phone Number</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  style={{ width: '100%', padding: '12px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '8px', margin: '6px 0 20px', boxSizing: 'border-box', background: 'white', color: DARK }}
                />
              </>
            )}

            {error && <p style={{ color: RED, fontSize: '13px' }}>{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: 600, background: RED, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              {loading ? 'Loading...' : 'View Menu'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (order) {
    const step = statusStep(order.status);
    const isTakeaway = session.orderType === 'TAKEAWAY';
    const labels = isTakeaway ? ['PENDING', 'PREPARING', 'READY'] : ['PENDING', 'PREPARING', 'SERVED'];
    const finalLabel = labels[2];
    return (
      <div style={pageStyle}>
        {tabPanel}
        <div style={topBar}>{brand}</div>
        <div style={{ maxWidth: '420px', margin: '40px auto', padding: '0 16px' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            {isTakeaway && order.tokenNumber && (
              <div style={{ background: '#fff4e6', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#e67e22', fontWeight: 700 }}>YOUR TOKEN</div>
                <div style={{ fontSize: '44px', fontWeight: 800, color: DARK, lineHeight: 1.1 }}>#{order.tokenNumber}</div>
              </div>
            )}
            <h1 style={{ fontSize: '20px', margin: '0 0 4px', color: DARK }}>Order #{order.id}</h1>
            <p style={{ color: '#888', margin: '0 0 24px' }}>Total: Rs. {order.totalAmount}</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 0' }}>
              {labels.map((label, index) => (
                <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', margin: '0 auto 6px',
                    background: step >= index + 1 ? RED : '#eee',
                    color: step >= index + 1 ? 'white' : '#999',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '14px',
                  }}>
                    {step > index + 1 || (step === index + 1 && label === finalLabel) ? '✓' : index + 1}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: step >= index + 1 ? RED : '#999' }}>{label}</span>
                </div>
              ))}
            </div>

            {order.status === 'READY' && isTakeaway ? (
              <p style={{ color: '#8e44ad', fontWeight: 700 }}>🥡 Your order is ready! Show token #{order.tokenNumber} at the counter.</p>
            ) : order.status === 'SERVED' ? (
              <p style={{ color: '#27ae60', fontWeight: 600 }}>{isTakeaway ? '🎉 Picked up. Enjoy your meal!' : '🎉 Served! Enjoy your meal.'}</p>
            ) : (
              <p style={{ color: '#888', fontSize: '13px' }}>We'll update this automatically — no need to refresh.</p>
            )}

            <button
              onClick={() => setOrder(null)}
              style={{ marginTop: '16px', padding: '11px 24px', fontSize: '14px', fontWeight: 600, background: DARK, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              Order More
            </button>
            {!isTakeaway && (
              <button
                onClick={() => setTabOpen(true)}
                style={{ marginTop: '12px', marginLeft: '8px', padding: '11px 24px', fontSize: '14px', fontWeight: 600, background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                🧾 My Tab / Bill
              </button>
            )}
            {!isTakeaway && (
              <button
                onClick={callWaiter}
                style={{ marginTop: '12px', marginLeft: '8px', padding: '11px 24px', fontSize: '14px', fontWeight: 600, background: waiterCalled ? '#eee' : 'white', color: waiterCalled ? '#27ae60' : RED, border: `1px solid ${waiterCalled ? '#27ae60' : RED}`, borderRadius: '8px', cursor: 'pointer' }}
              >
                {waiterCalled ? '✓ Waiter is coming' : '🔔 Call waiter'}
              </button>
            )}
            <button
              onClick={handleDone}
              style={{ marginTop: '12px', marginLeft: '8px', padding: '11px 24px', fontSize: '14px', fontWeight: 600, background: 'white', color: RED, border: `1px solid ${RED}`, borderRadius: '8px', cursor: 'pointer' }}
            >
              {session.orderType === 'TAKEAWAY' ? 'Finish' : "I'm done"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {tabPanel}
      <div style={topBar}>
        {brand}
        <div style={{ fontSize: '13px', fontWeight: 400, color: '#ccc', marginTop: '2px' }}>
          {session.orderType === 'TAKEAWAY' ? '🥡 Takeaway' : `Table ${session.tableNumber}`} · {session.customerName}
          {session.orderType !== 'TAKEAWAY' && (
            <button onClick={() => setTabOpen(true)} style={{ marginLeft: '12px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, background: '#27ae60', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
              🧾 My Tab
            </button>
          )}
          <button onClick={handleDone} style={{ marginLeft: '12px', padding: '3px 10px', fontSize: '11px', fontWeight: 600, background: 'transparent', color: '#ccc', border: '1px solid #666', borderRadius: '12px', cursor: 'pointer' }}>
            {session.orderType === 'TAKEAWAY' ? 'Leave' : "I'm done"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px 16px 120px' }}>
        {menuItems.length === 0 && <p style={{ color: '#888' }}>Loading menu...</p>}

        {recs.pairings.length > 0 && (
          <div style={{ background: '#fff4e6', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: DARK, marginBottom: '10px' }}>Goes well with your order</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {recs.pairings.map((p) => (
                <button key={p.id} onClick={() => addToCart(p.id)} style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 600, background: 'white', color: DARK, border: `1px solid ${RED}`, borderRadius: '20px', cursor: 'pointer' }}>
                  + {p.name} · Rs. {p.price}
                </button>
              ))}
            </div>
          </div>
        )}

        {menuItems.map((item) => (
          <div key={item.id} style={{
            background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '10px', background: '#f3f0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', overflow: 'hidden', flexShrink: 0 }}>
                {categoryEmoji(item.category)}
                {item.imageUrl && item.imageUrl.trim() && (
                  <img src={item.imageUrl} alt={item.name} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: DARK, fontSize: '15px' }}>
                  <span title={item.isVeg !== false ? 'Veg' : 'Non-veg'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', border: `2px solid ${item.isVeg !== false ? '#0f8a3c' : '#c0392b'}`, borderRadius: '3px', marginRight: '7px', verticalAlign: 'middle', boxSizing: 'border-box' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.isVeg !== false ? '#0f8a3c' : '#c0392b' }} /></span>
                  {item.name}
                  {recs.popular.some((p) => p.id === item.id) && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, color: '#e67e22', background: '#fff4e6', padding: '2px 8px', borderRadius: '10px' }}>🔥 Popular</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#999', margin: '2px 0' }}>{item.category}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: DARK }}>Rs. {item.price}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {cart[item.id] > 0 && (
                <>
                  <button onClick={() => removeFromCart(item.id)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${RED}`, background: 'white', color: RED, fontWeight: 700, cursor: 'pointer' }}>−</button>
                  <span style={{ fontWeight: 600, minWidth: '16px', textAlign: 'center' }}>{cart[item.id]}</span>
                </>
              )}
              <button onClick={() => addToCart(item.id)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: RED, color: 'white', fontWeight: 700, cursor: 'pointer' }}>+</button>
            </div>
          </div>
        ))}
      </div>

      {session && aiEnabled && (
        <>
          <button onClick={() => setAiOpen(!aiOpen)} style={{ position: 'fixed', right: '16px', bottom: cartItemCount > 0 ? '90px' : '20px', background: DARK, color: 'white', border: 'none', borderRadius: '24px', padding: '12px 18px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', zIndex: 20 }}>
            {aiOpen ? '✕ Close' : '✨ Ask AI'}
          </button>
          {aiOpen && (
            <div style={{ position: 'fixed', right: '16px', left: '16px', maxWidth: '420px', marginLeft: 'auto', bottom: cartItemCount > 0 ? '140px' : '70px', background: 'white', borderRadius: '14px', padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)', zIndex: 20 }}>
              <div style={{ fontWeight: 700, color: DARK, marginBottom: '4px' }}>What are you in the mood for?</div>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>Try: "something spicy under Rs. 300"</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') askAssistant(); }} placeholder="Ask about the menu" maxLength={300} style={{ flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', background: 'white', color: DARK }} />
                <button onClick={askAssistant} disabled={aiLoading} style={{ padding: '10px 16px', background: RED, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>{aiLoading ? '...' : 'Ask'}</button>
              </div>
              {aiReply && <p style={{ fontSize: '14px', color: DARK, margin: '12px 0 8px', lineHeight: 1.5 }}>{aiReply}</p>}
              {aiItems.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {aiItems.map((it) => (
                    <button key={it.id} onClick={() => addToCart(it.id)} style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 600, background: 'white', color: DARK, border: `1px solid ${RED}`, borderRadius: '20px', cursor: 'pointer' }}>
                      + {it.name} · Rs. {it.price}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {upiOpen && (() => {
        const amount = calculateTotal();
        const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(restaurantName || 'Restaurant')}&am=${amount}&cu=INR&tn=${encodeURIComponent('Food order')}`;
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiLink)}`;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ background: 'white', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '340px', textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '18px', color: DARK }}>Pay Rs. {amount} by UPI</h2>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888' }}>Scan with any UPI app, or tap the button on your phone</p>
              <img src={qr} alt="UPI QR" style={{ width: '200px', height: '200px' }} />
              <div style={{ fontSize: '12px', color: '#555', margin: '8px 0 12px' }}>{upiId}</div>
              <a href={upiLink} style={{ display: 'block', padding: '11px', background: DARK, color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>Open UPI app</a>
              <button
                onClick={async () => { await handlePayCash('UPI'); setUpiOpen(false); }}
                disabled={loading}
                style={{ width: '100%', padding: '12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginBottom: '8px' }}
              >
                {loading ? 'Placing...' : "I've paid — place order"}
              </button>
              <button onClick={() => setUpiOpen(false)} style={{ width: '100%', padding: '10px', background: '#eee', color: '#333', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#aaa' }}>The restaurant will check your payment at the counter.</p>
            </div>
          </div>
        );
      })()}

      {cartItemCount > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, background: RED, color: 'white',
          padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontSize: '14px' }}>
            <div style={{ fontWeight: 700 }}>{cartItemCount} item{cartItemCount > 1 ? 's' : ''}</div>
            <div style={{ fontSize: '13px', opacity: 0.9 }}>Rs. {calculateTotal()}</div>
          </div>
          {session.orderType !== 'TAKEAWAY' ? (
            <button
              onClick={() => handlePayCash('PAY_LATER')}
              disabled={loading}
              style={{ padding: '12px 20px', fontSize: '14px', fontWeight: 700, background: 'white', color: RED, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              {loading ? 'Placing...' : 'Place order · pay after meal'}
            </button>
          ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handlePayCash('CASH')}
              disabled={loading}
              style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, background: DARK, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              💵 Cash
            </button>
            {upiId && (
              <button
                onClick={() => setUpiOpen(true)}
                disabled={loading}
                style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, background: DARK, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                📲 UPI
              </button>
            )}
            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, background: 'white', color: RED, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              {loading ? 'Placing...' : 'Pay Online →'}
            </button>
          </div>
          )}
        </div>
      )}

      {session.orderType !== 'TAKEAWAY' && (
        <button
          onClick={callWaiter}
          style={{ position: 'fixed', left: '16px', bottom: cartItemCount > 0 ? '88px' : '20px', zIndex: 20, padding: '10px 16px', fontSize: '13px', fontWeight: 700, background: waiterCalled ? '#e9f9ee' : 'white', color: waiterCalled ? '#27ae60' : RED, border: `1px solid ${waiterCalled ? '#27ae60' : RED}`, borderRadius: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer' }}
        >
          {waiterCalled ? '✓ Waiter is coming' : '🔔 Call waiter'}
        </button>
      )}

      {error && <p style={{ color: RED, textAlign: 'center', padding: '0 16px' }}>{error}</p>}
    </div>
  );
}

export default App;
