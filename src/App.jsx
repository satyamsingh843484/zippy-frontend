import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
const HOST = window.location.hostname;
const API_URL = `https://zippy-backend-vc4w.onrender.com/api`;
const socket = io(`https://zippy-backend-vc4w.onrender.com`);

const getImgSrc = (path) => {
  if (!path) return 'https://via.placeholder.com/150';
  return path.startsWith('http') ? path : `https://zippy-backend-vc4w.onrender.com/uploads/${path}`;
};

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('zippy_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  const [view, setView] = useState(() => {
    const savedUser = localStorage.getItem('zippy_user');
    if (!savedUser) return 'home';
    const parsedUser = JSON.parse(savedUser);
    if (parsedUser.role === 'SELLER') return 'seller';
    if (parsedUser.role === 'PENDING_SELLER') return 'pending';
    if (parsedUser.role === 'ADMIN') return 'admin';
    return 'home';
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('zippy_cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  const [trackingStatus, setTrackingStatus] = useState(null);

  const startTracking = (orderId) => {
    setTrackingStatus('Waiting for confirmation... ⏳');
    socket.emit('track-order', orderId);
    socket.on('status-update', (status) => {
      setTrackingStatus(status);
    });
  };

  useEffect(() => {
    localStorage.setItem('zippy_cart', JSON.stringify(cart));
  }, [cart]);

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [location, setLocation] = useState("Bhagalpur, Bihar");
  const [customLocationInput, setCustomLocationInput] = useState("");
  const [isChangingLocation, setIsChangingLocation] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSearchChange = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.trim().length > 0) {
      try {
        const res = await fetch(`${API_URL}/products/search?q=${query}`);
        const data = await res.json();
        setSearchSuggestions(data);
        setShowSuggestions(true);
      } catch (err) { console.error(err); }
    } else {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  };
  
  useEffect(() => {
    setTimeout(() => {
      fetch(`${API_URL}/products/all`)
        .then(res => res.json())
        .then(data => { setProducts(data); setIsLoading(false); })
        .catch(err => { console.error(err); setIsLoading(false); });
    }, 800); 
    detectLocation();
  }, []);

  const detectLocation = () => {
    setLocation("Detecting...");
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            const city = data.address.city || data.address.village || data.address.suburb || data.address.state_district || "Bhagalpur";
            const state = data.address.state || "Bihar";
            setLocation(`${city}, ${state}`);
          } catch (error) { fetchIpLocation(); }
        }, 
        () => fetchIpLocation(), { enableHighAccuracy: true, timeout: 5000 }
      );
    } else { fetchIpLocation(); }
  };

  const fetchIpLocation = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if(data.city && data.city !== "Patna") setLocation(`${data.city}, ${data.region}`);
      else setLocation("Bhagalpur, Bihar");
    } catch (err) { setLocation("Bhagalpur, Bihar"); }
  };

  const handleManualLocationSubmit = (e) => {
    e.preventDefault();
    if (customLocationInput.trim() !== "") {
      setLocation(customLocationInput);
      setIsChangingLocation(false);
      setCustomLocationInput("");
    }
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData); 
    localStorage.setItem('zippy_user', JSON.stringify(userData));
    setIsAuthOpen(false);
    
    if (userData.role === 'SELLER') { setView('seller'); setCart([]); } 
    else if (userData.role === 'PENDING_SELLER') { setView('pending'); setCart([]); }
    else if (userData.role === 'ADMIN') { setView('admin'); setCart([]); } 
    else { setView('home'); }
  };

  const handleLogout = () => {
    setUser(null); localStorage.removeItem('zippy_user'); setCart([]); setView('home');
  };

  const [editingProduct, setEditingProduct] = useState(null);

  const handleDelete = async (productId) => {
    const isConfirmed = window.confirm("Are you sure you want to delete this product?");
    if (!isConfirmed) return;
    try {
      const response = await fetch(`${API_URL}/products/delete/${productId}`, { method: 'DELETE' });
      if (response.ok) {
        alert("Product deleted successfully!");
        window.location.reload(); 
      } else { alert("Failed to delete product."); }
    } catch (error) { console.error("Error deleting product:", error); }
  };

  const handleEditClick = (product) => {
    setEditingProduct(product); 
  };

  const getUniversalId = (item) => String(item._id || item.id || item.title);

  const addToCart = (product) => {
    setCart((prev) => {
      const incomingId = getUniversalId(product);
      const existingItem = prev.find(item => getUniversalId(item) === incomingId);
      if (existingItem) {
        return prev.map(item => getUniversalId(item) === incomingId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId) => {
    const targetId = String(productId); 
    setCart((prev) => 
      prev.map(item => getUniversalId(item) === targetId ? { ...item, quantity: item.quantity - 1 } : item
      ).filter(item => item.quantity > 0)
    );
  };

  const openProduct = (product) => {
    setSelectedProduct(product);
    setView('product');
  };

  const cartItemCount = cart.reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="min-h-screen bg-[#fafafc] text-gray-900 font-sans overflow-x-hidden selection:bg-blue-200 selection:text-blue-900 pb-28 md:pb-0 relative z-0">
      {editingProduct && (
        <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} />
      )}
      
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        .hide-scroll::-webkit-scrollbar { display: none; }
        
        .shimmer {
          background: rgba(200,200,200,0.15);
          background-image: linear-gradient(to right, rgba(200,200,200,0) 0%, rgba(200,200,200,0.15) 20%, rgba(200,200,200,0) 40%, rgba(200,200,200,0) 100%);
          background-repeat: no-repeat; background-size: 800px 100%; 
          animation: placeholderShimmer 1.5s infinite linear forwards;
        }
        @keyframes placeholderShimmer { 0% { background-position: -468px 0; } 100% { background-position: 468px 0; } }
        
        @keyframes float {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(3deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        .animate-float { animation: float 12s ease-in-out infinite; }

        /* 💥 PREMIUM UI CLASSES 💥 */
        .glass-nav {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.5);
        }
        
        .sunlit-glow {
          background: radial-gradient(circle at top left, rgba(255, 245, 200, 0.8) 0%, rgba(255, 255, 255, 0) 70%);
        }
        
        .studio-shadow {
          box-shadow: 0 15px 35px -5px rgba(0,0,0,0.04), 0 5px 15px -5px rgba(0,0,0,0.02), inset 0 2px 10px rgba(255,255,255,0.8);
        }
        
        .premium-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 25px 50px -12px rgba(37,99,235,0.15), 0 10px 20px -10px rgba(37,99,235,0.1);
        }

        .scratch-card-pattern {
          background-image: repeating-linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 75%, #cbd5e1 75%, #cbd5e1), repeating-linear-gradient(45deg, #cbd5e1 25%, #e2e8f0 25%, #e2e8f0 75%, #cbd5e1 75%, #cbd5e1);
          background-position: 0 0, 10px 10px;
          background-size: 20px 20px;
        }
        
        .animate-pop-in {
          animation: popIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        @keyframes popIn {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        
        /* Custom Input Styling */
        .glass-input {
          background: rgba(243, 244, 246, 0.7);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }
        .glass-input:focus-within {
          background: #ffffff;
          box-shadow: 0 10px 25px -5px rgba(37,99,235,0.1), inset 0 0 0 2px rgba(37,99,235,0.2);
        }
      `}</style>

      {/* --- AESTHETIC BACKGROUND BLOBS --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-[30rem] h-[30rem] bg-blue-200/40 rounded-full mix-blend-multiply filter blur-[120px] opacity-60 animate-float"></div>
        <div className="absolute top-1/3 -right-40 w-[30rem] h-[30rem] bg-indigo-200/40 rounded-full mix-blend-multiply filter blur-[120px] opacity-60 animate-float" style={{ animationDelay: '3s' }}></div>
      </div>

      {/* --- DESKTOP NAVBAR (GLASSMORPHISM) --- */}
      <nav className="hidden md:block glass-nav px-4 md:px-8 py-4 sticky top-0 z-40 shadow-[0_4px_30px_rgba(0,0,0,0.03)] transition-all">
        <div className="flex justify-between items-center max-w-[1400px] mx-auto">
          <div className="flex items-center space-x-8">
            <div className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { if((!user || user.role === 'CUSTOMER')) { setActiveCategory('All'); setView('home'); setSelectedProduct(null); } }}>
              <span className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600">zippy</span>
            </div>
            
            {(!user || user.role === 'CUSTOMER') && (
              <div className="flex flex-col border-l-2 border-gray-200/60 pl-6 cursor-pointer group" onClick={() => setIsChangingLocation(!isChangingLocation)}>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors flex items-center gap-1">
                  Delivery Location <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 transition-transform group-hover:translate-y-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </span>
                <span className="text-[15px] font-extrabold text-gray-800 truncate w-56">{location}</span>
              </div>
            )}
          </div>

          {(!user || user.role === 'CUSTOMER') && (
            <div className="flex-1 max-w-2xl mx-8 relative z-50">
               <div className="w-full flex items-center glass-input rounded-2xl px-5 py-3.5 border border-white/50">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                 <input type="text" placeholder="Search for 'Apple', 'Milk'..." value={searchQuery} onChange={handleSearchChange} onFocus={() => searchQuery && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className="w-full bg-transparent focus:outline-none ml-3 text-sm font-bold text-gray-800 placeholder-gray-400" />
               </div>
               
               {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.1)] border border-white overflow-hidden py-2 animate-fade-in-up">
                     {searchSuggestions.map(item => (
                        <div key={item._id} onClick={() => { openProduct(item); setSearchQuery(''); setShowSuggestions(false); }} className="px-5 py-3 hover:bg-blue-50/80 cursor-pointer flex items-center justify-between group transition-colors">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 border border-gray-100 shadow-sm group-hover:scale-105 transition-transform">
                                <img src={item.imagePath?.startsWith('http') ? item.imagePath : getImgSrc(item.imagePath)} className="w-full h-full object-contain mix-blend-multiply" alt="" onError={(e) => e.target.src='https://via.placeholder.com/50'} />
                              </div>
                              <div>
                                <p className="text-sm font-black text-gray-800 group-hover:text-blue-700 transition-colors">{item.title}</p>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.category}</span>
                              </div>
                           </div>
                           <span className="text-sm font-black text-gray-900 bg-gray-50 px-3 py-1 rounded-lg">₹{item.price}</span>
                        </div>
                     ))}
                  </div>
               )}
            </div>
          )}

          <div className="flex items-center space-x-6">
            {!user ? (
              <button onClick={() => setIsAuthOpen(true)} className="font-extrabold text-gray-600 hover:text-blue-700 transition-colors cursor-pointer px-4">Login</button>
            ) : (
              <div className="flex flex-col items-end cursor-pointer group px-2" onClick={() => {
                if (user.role === 'ADMIN') setView('admin');
                else if (user.role === 'PENDING_SELLER') setView('pending');
                else if (user.role === 'SELLER') setView('seller');
                else setView('account');
              }} title="Go to Dashboard">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Welcome</span>
                <span className="text-sm font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600 group-hover:opacity-80 transition-opacity flex items-center gap-1">{user.name}</span>
              </div>
            )}

            {(!user || user.role === 'CUSTOMER') && (
              <button onClick={() => setIsCartOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-[0_10px_20px_rgba(37,99,235,0.2)] hover:shadow-[0_15px_30px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 transition-all cursor-pointer border border-blue-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                <span>My Cart</span>
                {cartItemCount > 0 && <span className="bg-white text-blue-700 px-2 py-0.5 rounded-lg text-[11px] ml-1 shadow-sm">{cartItemCount}</span>}
              </button>
            )}
          </div>
        </div>
      </nav>

      {isChangingLocation && (!user || user.role === 'CUSTOMER') && (
        <div className="bg-white/90 backdrop-blur-xl border-b border-white/50 py-6 px-4 shadow-[0_10px_30px_rgba(0,0,0,0.05)] transition-all duration-300 relative z-30">
          <div className="max-w-2xl mx-auto flex flex-col md:flex-row gap-4 items-center">
            <form onSubmit={handleManualLocationSubmit} className="w-full flex gap-3">
              <input type="text" required placeholder="Enter exact Society, Block or Village..." value={customLocationInput} onChange={(e) => setCustomLocationInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner" />
              <button type="submit" className="bg-gray-900 text-white font-black px-8 py-3.5 rounded-xl text-sm shadow-lg hover:bg-black hover:-translate-y-0.5 transition-all">Set Location</button>
            </form>
            <button onClick={detectLocation} className="text-xs font-black text-blue-600 hover:text-blue-800 transition whitespace-nowrap uppercase tracking-widest cursor-pointer flex items-center gap-1 bg-blue-50 px-4 py-3 md:py-2 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Auto-Detect
            </button>
          </div>
        </div>
      )}

      <main className="w-full relative z-10">
        {view === 'home' && (!user || user.role === 'CUSTOMER') && <HomeView products={products} addToCart={addToCart} openProduct={openProduct} location={location} setIsChangingLocation={setIsChangingLocation} isLoading={isLoading} user={user} setIsAuthOpen={setIsAuthOpen} setView={setView} activeTheme={activeCategory} setActiveTheme={setActiveCategory} getImgSrc={getImgSrc} searchQuery={searchQuery} handleSearchChange={handleSearchChange} showSuggestions={showSuggestions} searchSuggestions={searchSuggestions} setShowSuggestions={setShowSuggestions} />}
        {view === 'categories' && (!user || user.role === 'CUSTOMER') && <CategoriesView setView={setView} setActiveCategory={setActiveCategory} />}
        
        {view === 'product' && (!user || user.role === 'CUSTOMER') && (
          <ProductDetailView product={selectedProduct} addToCart={addToCart} cart={cart} removeFromCart={removeFromCart} setView={setView} />
        )}

        {view === 'account' && (!user || user.role === 'CUSTOMER') && <AccountView user={user} onLogout={handleLogout} setView={setView} />}
        {view === 'help' && (!user || user.role === 'CUSTOMER') && <HelpView setView={setView} />}
        
        {view === 'seller' && <SellerDashboard user={user} onLogout={handleLogout} />}
        {view === 'pending' && <PendingApprovalView onLogout={handleLogout} />}
        {view === 'admin' && <AdminDashboardView user={user} onLogout={handleLogout} />}
      </main>

      <Footer />

      {/* --- AESTHETIC FLOATING PILL BOTTOM NAVIGATION (MOBILE) --- */}
      {(!user || user.role === 'CUSTOMER') && (
        <div className="md:hidden fixed bottom-6 left-5 right-5 bg-white/80 backdrop-blur-2xl border border-white/60 z-50 flex justify-around items-center py-2.5 px-2 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)]">
           <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all ${view === 'home' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={view === 'home' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              <span className="text-[9px] font-black uppercase tracking-wider">Home</span>
           </button>
           
           <button onClick={() => setView('categories')} className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all ${view === 'categories' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              <span className="text-[9px] font-black uppercase tracking-wider">Categories</span>
           </button>

           <button onClick={() => setIsCartOpen(true)} className="relative -mt-10 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-[0_15px_30px_rgba(37,99,235,0.4)] border-4 border-[#fafafc] cursor-pointer hover:scale-105 transition-transform z-10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              {cartItemCount > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#fafafc] shadow-sm">{cartItemCount}</span>}
           </button>

           <button onClick={() => setView('help')} className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all ${view === 'help' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={view === 'help' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              <span className="text-[9px] font-black uppercase tracking-wider">Support</span>
           </button>
        </div>
      )}

      {/* --- AUTH MODAL --- */}
      {isAuthOpen && (
        <div className="fixed inset-0 z-[70] flex justify-center items-center bg-gray-900/60 backdrop-blur-md px-4 transition-opacity">
          <div className="absolute inset-0" onClick={() => setIsAuthOpen(false)}></div>
          <div className="relative w-full max-w-[850px] bg-white rounded-[2.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.3)] flex flex-col md:flex-row overflow-hidden animate-pop-in z-10 border border-white">
            <button onClick={() => setIsAuthOpen(false)} className="absolute top-4 right-4 bg-black/5 md:bg-white/20 backdrop-blur-md p-2 rounded-full text-gray-800 md:text-white hover:bg-black/10 transition cursor-pointer z-20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <AuthComponent onLogin={handleLoginSuccess} />
          </div>
        </div>
      )}

      {/* --- CART DRAWER --- */}
      {isCartOpen && <CartDrawer cart={cart} setCart={setCart} user={user} setIsCartOpen={setIsCartOpen} setIsAuthOpen={setIsAuthOpen} addToCart={addToCart} removeFromCart={removeFromCart} startTracking={startTracking} />}
      
      {/* --- ULTRA PREMIUM SUCCESS SCREEN --- */}
      {trackingStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 transition-opacity duration-500">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] transform transition-all scale-100 animate-pop-in border border-white">
             
             {/* TOP HALF: Glowing Success Graphic */}
             <div className="bg-gradient-to-br from-emerald-50 to-teal-100 p-8 pb-14 flex flex-col items-center relative overflow-hidden">
                <div className="absolute w-64 h-64 bg-emerald-400/30 rounded-full blur-3xl -top-10 -right-10 animate-pulse"></div>
                <div className="absolute w-64 h-64 bg-teal-300/30 rounded-full blur-3xl -bottom-10 -left-10 animate-pulse delay-700"></div>
                
                {/* 3D Pop-Out Icon */}
                <div className="relative w-28 h-28 mt-4">
                   <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-25 duration-1000"></div>
                   <div className="absolute inset-2 bg-emerald-400 rounded-full opacity-40"></div>
                   <div className="absolute inset-4 bg-gradient-to-tr from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_40px_rgba(16,185,129,0.6)] flex items-center justify-center z-10 border border-emerald-300/50">
                      <svg className="w-10 h-10 text-white drop-shadow-md animate-[bounce_2s_ease-in-out_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                   </div>
                </div>
             </div>

             {/* BOTTOM HALF: Content & Actions */}
             <div className="bg-white p-8 -mt-8 rounded-t-[2.5rem] relative z-20 flex flex-col items-center text-center shadow-[0_-10px_20px_rgba(0,0,0,0.03)]">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Order Confirmed!</h2>
                <p className="text-slate-500 font-bold text-sm mb-6 px-4">Your delicious food is being prepared with magic and love.</p>

                {/* Micro-Interaction Status Card */}
                <div className="w-full bg-slate-50 border border-slate-100 rounded-3xl p-5 mb-8 shadow-sm">
                   <div className="flex justify-between items-center mb-4">
                     <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Estimated Time</span>
                     <span className="text-slate-800 font-black text-lg">20 - 25 mins</span>
                   </div>
                   
                   <div className="w-full mt-2 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm relative">
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path></svg>
                      </div>
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden relative">
                         <div className="absolute top-0 left-0 h-full bg-emerald-500 w-[35%] animate-pulse rounded-full"></div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                      </div>
                   </div>
                   
                   <div className="flex justify-between mt-2 text-[9px] font-black text-slate-400 uppercase tracking-wider px-1">
                      <span>Kitchen</span>
                      <span>Delivery</span>
                   </div>
                </div>

                <button onClick={() => setTrackingStatus(null)} className="w-full bg-gray-900 text-white px-6 py-4 rounded-2xl font-black text-lg hover:bg-black hover:shadow-2xl hover:shadow-gray-900/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer mb-2">
                  Track Live Order
                </button>
                <button onClick={() => setTrackingStatus(null)} className="w-full text-slate-400 font-bold py-3 hover:text-slate-700 transition-colors cursor-pointer text-sm">
                  Close
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================
   PREMIUM CATEGORIES PAGE
========================================= */
function CategoriesView({ setView, setActiveCategory }) {
  const CATEGORIES_DATA = [
    { name: 'Fresh', icon: '🥑', img: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=600&q=80' },
    { name: 'Grocery', icon: '🌾', img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=600&q=80' },
    { name: 'Electronics', icon: '🎧', img: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=600&q=80' },
    { name: 'Fashion', icon: '👕', img: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=600&q=80' },
    { name: 'Beauty', icon: '💄', img: 'https://images.unsplash.com/photo-1596462502278-27bf85033e5a?auto=format&fit=crop&w=600&q=80' },
    { name: 'Home', icon: '🛋️', img: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=600&q=80' },
    { name: 'Kids', icon: '🧸', img: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80' },
    { name: '50% Off', icon: '🏷️', img: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=600&q=80' },
    { name: 'School Time', icon: '🎒', img: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=600&q=80' },
    { name: "Father's Day", icon: '👨', img: 'https://images.unsplash.com/photo-1622384784422-95f26487ff63?auto=format&fit=crop&w=600&q=80' },
  ];

  return (
    <div className="max-w-6xl mx-auto pt-2 pb-40 px-4 md:px-8 animate-fade-in-up relative z-10">
      <div className="flex items-center gap-3 mb-6 sticky top-0 md:top-20 z-20 bg-[#fafafc]/95 backdrop-blur-xl py-4 -mx-4 px-4 md:mx-0 md:px-0 border-b border-gray-200/60 md:border-none shadow-[0_4px_20px_rgba(0,0,0,0.02)] md:shadow-none">
        <button onClick={() => setView('home')} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-200 font-bold text-xl hover:bg-gray-50 transition cursor-pointer hover:-translate-x-1">←</button>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Explore Categories</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {CATEGORIES_DATA.map((cat, i) => (
          <div 
            key={i} 
            onClick={() => { setActiveCategory(cat.name); setView('home'); }}
            className="relative h-44 md:h-52 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden studio-shadow hover:shadow-[0_20px_40px_rgba(0,0,0,0.12)] hover:-translate-y-1.5 transition-all duration-500 cursor-pointer group border border-white"
          >
            <img src={cat.img} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-90 group-hover:opacity-100" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/95 via-gray-900/20 to-transparent"></div>
            
            <div className="absolute bottom-0 left-0 p-4 md:p-5 w-full flex flex-col justify-end">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-3 shadow-inner border border-white/30 group-hover:scale-110 transition-transform">
                 <span className="text-lg md:text-xl drop-shadow-md">{cat.icon}</span>
              </div>
              <h3 className="text-white font-black text-lg md:text-xl drop-shadow-md leading-tight tracking-wide">{cat.name}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================
   MEGA HOME VIEW 
========================================= */
function HomeView({ products, addToCart, openProduct, location, setIsChangingLocation, isLoading, user, setIsAuthOpen, setView, activeTheme, setActiveTheme, getImgSrc, searchQuery, handleSearchChange, showSuggestions, searchSuggestions, setShowSuggestions }) {
  
  const THEMES = {
    'All': { bg: 'bg-[#0b5cff]', icon: '🧺', label: 'All' },
    'Fresh': { bg: 'bg-[#00b259]', icon: '🥑', label: 'Fresh' },
    'Grocery': { bg: 'bg-[#f97316]', icon: '🌾', label: 'Grocery' },
    'Electronics': { bg: 'bg-[#334155]', icon: '🎧', label: 'Electronics' },
    'Fashion': { bg: 'bg-[#db2777]', icon: '👕', label: 'Fashion' },
    'Beauty': { bg: 'bg-[#9333ea]', icon: '💄', label: 'Beauty' },
    'Home': { bg: 'bg-[#0891b2]', icon: '🛋️', label: 'Home' },
    'Kids': { bg: 'bg-[#14b8a6]', icon: '🧸', label: 'Kids' },
    '50% Off': { bg: 'bg-[#e63946]', icon: '🏷️', label: '50% Off' },
    'School Time': { bg: 'bg-[#f59e0b]', icon: '🎒', label: 'School Time' },
    "Father's Day": { bg: 'bg-[#2563eb]', icon: '👨', label: "Father's Day" }
  };
  
  const currentTheme = THEMES[activeTheme] || THEMES['All'];

  const filteredProducts = activeTheme === 'All' 
    ? products 
    : products.filter(p => p.category === activeTheme);

  return (
    <div className="w-full pb-10">
      
      {/* 1. DYNAMIC COLOR HEADER SECTION */}
      <div className={`w-full transition-colors duration-700 rounded-b-[2.5rem] md:rounded-none shadow-lg relative overflow-hidden ${currentTheme.bg}`}>
        
        {/* Soft Glow Overlays */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Mobile Header Elements */}
        <div className="md:hidden px-4 pt-4 pb-2 text-white relative z-10">
           <div className="flex justify-between items-center mb-5">
              <div onClick={() => setIsChangingLocation(true)} className="cursor-pointer group">
                 <h2 className="font-black text-[28px] tracking-tight leading-none mb-1 drop-shadow-md group-hover:opacity-80 transition-opacity">15 mins</h2>
                 <p className="text-xs font-bold opacity-90 truncate max-w-[250px] flex items-center gap-1 drop-shadow-sm">
                   To {location} <span className="text-[10px] bg-white/20 px-1 rounded">▼</span>
                 </p>
              </div>
              <div onClick={() => !user ? setIsAuthOpen(true) : setView('account')} className="w-11 h-11 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-xl shadow-inner border border-white/30 cursor-pointer hover:bg-white/30 transition-all hover:scale-105">
                 {user ? <span className="text-sm font-black text-white uppercase tracking-wider">{user.name.charAt(0)}</span> : '👤'}
              </div>
           </div>
           
           <div className="relative z-50 mb-2">
             <div className="bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3.5 flex items-center shadow-[0_10px_25px_rgba(0,0,0,0.1)] border border-white focus-within:ring-4 focus-within:ring-white/30 transition-all">
                <span className="text-gray-400 text-lg">🔍</span>
                <input type="text" placeholder="Search for 'Protein Atta'" value={searchQuery} onChange={handleSearchChange} onFocus={() => searchQuery && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className="w-full bg-transparent ml-2 outline-none text-sm text-gray-900 font-bold placeholder-gray-400" />
             </div>
             
             {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.2)] border border-gray-100 overflow-hidden py-2">
                   {searchSuggestions.map(item => (
                      <div key={item._id} onClick={() => { openProduct(item); setSearchQuery(''); setShowSuggestions(false); }} className="px-4 py-3 hover:bg-blue-50/80 border-b last:border-b-0 border-gray-50 cursor-pointer flex items-center justify-between transition-colors">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-1 border border-gray-100 shadow-sm">
                              <img src={item.imagePath.startsWith('http') ? item.imagePath : getImgSrc(item.imagePath)} className="w-full h-full object-contain mix-blend-multiply" alt="" onError={(e) => e.target.src='https://via.placeholder.com/50'} />
                            </div>
                            <p className="text-xs font-black text-gray-800">{item.title}</p>
                         </div>
                         <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">₹{item.price}</span>
                      </div>
                   ))}
                </div>
             )}
           </div>
        </div>

        <div className="max-w-[1400px] mx-auto relative z-10">
           {/* CATEGORY NAV */}
           <div className="flex overflow-x-auto hide-scroll gap-6 md:gap-8 px-4 md:px-8 pt-3 md:pt-6 border-b border-white/10">
              {Object.values(THEMES).map((tab) => (
                 <div key={tab.label} onClick={() => setActiveTheme(tab.label)} className="flex flex-col items-center cursor-pointer min-w-max relative pb-3 group">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-1.5 transition-all duration-300 ${activeTheme === tab.label ? 'bg-white/20 shadow-inner border border-white/30 scale-110' : 'hover:bg-white/10'}`}>
                      <span className="text-2xl drop-shadow-sm">{tab.icon}</span>
                    </div>
                    <span className={`text-[10px] md:text-xs font-black transition-all uppercase tracking-wider ${activeTheme === tab.label ? 'text-white drop-shadow-sm' : 'text-white/60 group-hover:text-white/90'}`}>
                      {tab.label}
                    </span>
                    {activeTheme === tab.label && (
                       <div className="absolute bottom-0 w-full h-1 bg-white rounded-t-md shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
                    )}
                 </div>
              ))}
           </div>

           <div className="px-4 md:px-8 py-6 md:py-10 flex justify-between items-center relative overflow-hidden">
              <div className="absolute right-[-20px] top-[-10px] opacity-10 text-[120px] transform rotate-12 pointer-events-none">⚡</div>
              <h2 className="text-[36px] md:text-6xl font-black italic transform -skew-x-[12deg] text-yellow-300 drop-shadow-[0_4px_10px_rgba(0,0,0,0.2)] leading-none ml-2">
                 ⭐ ZIPPY <br className="md:hidden"/> <span className="text-white drop-shadow-md">SUPER SALE</span> <span className="text-3xl md:text-5xl">🔥</span>
              </h2>
           </div>

           {/* UNIFORM EDGE-TO-EDGE BANNERS */}
           <div className="w-full pb-8 md:pb-12">
              <div className="flex overflow-x-auto snap-x hide-scroll gap-4 px-4 md:px-8">
                 
                 <div className="min-w-[280px] md:min-w-[360px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-[0_10px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)] cursor-pointer group overflow-hidden h-[160px] md:h-[200px] hover:-translate-y-1.5 transition-all duration-500 border border-white/20 bg-gray-900">
                    <img src="https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 group-hover:rotate-1 transition-transform duration-700 z-0 opacity-70" alt="Snacks"/>
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-8 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-2xl md:text-3xl leading-tight mb-1.5 drop-shadow-lg">Midnight Munchies</h3>
                      <p className="text-rose-400 font-black text-[10px] md:text-xs tracking-widest bg-rose-400/10 w-fit px-2 py-1 rounded">DELIVERED TILL 3 AM</p>
                    </div>
                 </div>

                 <div className="min-w-[280px] md:min-w-[360px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-[0_10px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)] cursor-pointer group overflow-hidden h-[160px] md:h-[200px] hover:-translate-y-1.5 transition-all duration-500 border border-white/20 bg-green-900">
                    <img src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 group-hover:rotate-1 transition-transform duration-700 z-0 opacity-70" />
                    <div className="absolute inset-0 bg-gradient-to-r from-green-900 via-green-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-8 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-2xl md:text-3xl leading-tight mb-1.5 drop-shadow-lg">Organic Greens</h3>
                      <p className="text-green-300 font-black text-[10px] md:text-xs tracking-widest bg-green-300/10 w-fit px-2 py-1 rounded">DIRECT FROM FARMS</p>
                    </div>
                 </div>

                 <div className="min-w-[280px] md:min-w-[360px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-[0_10px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)] cursor-pointer group overflow-hidden h-[160px] md:h-[200px] hover:-translate-y-1.5 transition-all duration-500 border border-white/20 bg-red-900">
                    <img src="https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 group-hover:rotate-1 transition-transform duration-700 z-0 opacity-70" />
                    <div className="absolute inset-0 bg-gradient-to-r from-red-900 via-red-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-8 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-2xl md:text-3xl leading-tight mb-1.5 drop-shadow-lg">Protein Power</h3>
                      <p className="text-red-300 font-black text-[10px] md:text-xs tracking-widest bg-red-300/10 w-fit px-2 py-1 rounded">FRESH CHICKEN & EGGS</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* 2. MAIN PRODUCT GRID (PREMIUM SKIN) */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-10 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-8 border-b border-gray-200/60 pb-5">
           <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-rose-500 rounded-xl flex items-center justify-center text-xl shadow-inner border border-white">🔥</div>
           <h2 className={`text-2xl md:text-3xl font-black tracking-tight ${activeTheme === 'All' ? 'text-gray-900' : 'text-gray-900'}`}>
              {activeTheme === 'All' ? 'Lowest Prices For You' : `${activeTheme} Highlights`}
           </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {isLoading ? (
            [1, 2, 3, 4, 5, 6].map((skel) => (
              <div key={skel} className="bg-white rounded-[1.5rem] p-4 border border-gray-100 shadow-sm flex flex-col h-full">
                 <div className="h-32 w-full mb-4 rounded-xl shimmer"></div>
                 <div className="h-4 w-3/4 rounded shimmer mb-2"></div>
                 <div className="h-3 w-1/2 rounded shimmer mb-6"></div>
                 <div className="mt-auto flex justify-between items-center pt-2">
                    <div className="h-6 w-12 rounded shimmer"></div>
                    <div className="h-10 w-10 rounded-xl shimmer"></div>
                 </div>
              </div>
            ))
          ) : (
            <>
              {filteredProducts.map(p => (
                <div key={p.id} onClick={() => openProduct(p)} className="bg-white rounded-[1.5rem] p-4 studio-shadow premium-hover transition-all duration-500 cursor-pointer group flex flex-col h-full relative overflow-hidden border border-white">
                  
                  {/* Sunlit effect filter */}
                  <div className="absolute inset-0 sunlit-glow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                  
                  <div className="absolute top-0 left-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[9px] font-black px-3 py-1.5 rounded-br-xl rounded-tl-[1.5rem] shadow-sm z-10 uppercase tracking-widest">Bestseller</div>
                  
                  {/* Image with subtle radial backdrop */}
                  <div className="h-28 md:h-36 w-full mb-4 rounded-xl overflow-hidden flex items-center justify-center p-2 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-50 via-white to-white mt-3 group-hover:from-blue-50/50 transition-colors duration-500">
                     <img src={p.imagePath?.startsWith('http') ? p.imagePath : `${API_URL.replace('/api', '')}/uploads/${p.imagePath}`} alt={p.title} className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-110 group-hover:-translate-y-1 transition-transform duration-700 drop-shadow-sm" onError={(e) => e.target.src='https://via.placeholder.com/400'} />
                  </div>
                  
                  <div className="flex flex-col flex-1 justify-between relative z-10">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[10px] bg-green-50 border border-green-100 text-green-700 px-1.5 py-0.5 rounded font-black flex items-center gap-0.5"><svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg> 4.5</span>
                        <span className="text-[9px] text-gray-400 font-extrabold flex items-center gap-1 uppercase tracking-wider"><span className="w-1 h-1 bg-gray-300 rounded-full"></span> 12 Mins</span>
                      </div>
                      <h4 className="text-xs md:text-sm font-black text-gray-800 line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors">{p.title}</h4>
                      <span className="inline-block mt-2 border border-gray-100 text-gray-500 bg-gray-50 text-[9px] font-black px-2 py-0.5 rounded">1 Pack</span>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-dashed border-gray-200 flex items-end justify-between relative">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-rose-500 font-black uppercase mb-0.5 tracking-wider">Price Drop</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base md:text-xl font-black text-gray-900">₹{(p.price)}</span>
                          <span className="text-[10px] text-gray-400 line-through font-bold">₹{(p.price * 1.15).toFixed(0)}</span>
                        </div>
                      </div>
                      
                      <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} className="absolute -right-2 -bottom-2 w-11 h-11 bg-white border border-gray-100 text-blue-600 rounded-xl flex items-center justify-center text-2xl font-light hover:bg-blue-600 hover:text-white transition-all shadow-sm hover:shadow-[0_8px_20px_rgba(37,99,235,0.3)] cursor-pointer hover:scale-105 active:scale-95">
                         +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-24 flex flex-col items-center justify-center bg-gray-50 rounded-[2rem] border border-dashed border-gray-300">
                   <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
                     <span className="text-4xl opacity-40">🛒</span>
                   </div>
                   <h3 className="text-xl font-black text-gray-800">No items found</h3>
                   <p className="text-gray-500 font-bold mt-1 text-sm">We are restocking soon!</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3. ZIPPY CAFE SECTION (DARK PREMIUM) */}
      <div className="w-full bg-gradient-to-b from-gray-900 to-black py-12 md:py-20 my-8 text-white relative overflow-hidden">
         {/* Abstract background elements */}
         <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-orange-500/10 rounded-full blur-[100px] pointer-events-none"></div>
         
         <div className="max-w-[1400px] mx-auto px-4 md:px-8 relative z-10">
            <div className="flex justify-between items-end mb-8 md:mb-10">
               <div>
                 <span className="bg-gradient-to-r from-orange-400 to-rose-500 text-white text-[10px] font-black tracking-widest px-3 py-1 rounded-md mb-3 inline-block uppercase shadow-lg shadow-orange-500/20">Freshly Brewed</span>
                 <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">Zippy Cafe <span className="text-[#f59e0b] drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">☕</span></h2>
               </div>
            </div>
         </div>
           
         <div className="w-full relative z-10">
            <div className="flex overflow-x-auto snap-x hide-scroll gap-5 px-4 md:px-8 pb-8 pt-2">
               {[
                 {n: 'Cappuccino', p: 140, i: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=200&q=80'},
                 {n: 'Butter Croissant', p: 180, i: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=200&q=80'},
                 {n: 'Fudge Brownie', p: 120, i: 'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=200&q=80'},
                 {n: 'Hot Chocolate', p: 160, i: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=200&q=80'},
                 {n: 'Grill Sandwich', p: 250, i: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=200&q=80'},
                 {n: 'Iced Latte', p: 190, i: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=200&q=80'},
                 {n: 'Blueberry Muffin', p: 150, i: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?auto=format&fit=crop&w=200&q=80'},
                 {n: 'Veg Puff', p: 80, i: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=200&q=80'}
               ].map((item, i) => (
                  <div key={i} className="min-w-[160px] md:min-w-[200px] bg-gray-800/50 backdrop-blur-md p-4 rounded-[1.5rem] border border-gray-700 hover:border-gray-500 transition-all duration-300 group cursor-pointer snap-center shadow-xl hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
                     <div className="h-32 w-full rounded-xl mb-4 overflow-hidden relative shadow-inner">
                       <img src={item.i} alt={item.n} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-90 group-hover:opacity-100" />
                     </div>
                     <h4 className="text-sm md:text-base font-black text-white truncate mb-1">{item.n}</h4>
                     <div className="flex justify-between items-end mt-4">
                        <span className="font-black text-lg text-white drop-shadow-md">₹{item.p}</span>
                        <button 
                          onClick={() => addToCart({ id: item.n, title: item.n, price: item.p, imagePath: item.i, category: 'Cafe' })} 
                          className="bg-white text-gray-900 text-[10px] md:text-xs font-black px-4 py-2 rounded-xl transition-all cursor-pointer hover:bg-orange-500 hover:text-white shadow-sm hover:shadow-orange-500/30 hover:scale-105 active:scale-95"
                        >
                          ADD
                        </button>
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
}

/* =========================================
   NEW COMPONENT: HELP / SUPPORT VIEW
========================================= */
function HelpView({ setView }) {
  return (
    <div className="max-w-3xl mx-auto pt-8 pb-32 px-4 md:px-8 animate-fade-in-up relative z-10">
      <div className="flex items-center gap-4 mb-10">
        <button onClick={() => setView('home')} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-gray-200 font-bold text-xl hover:bg-gray-50 transition cursor-pointer hover:-translate-x-1">←</button>
        <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">Zippy Support</h1>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-gray-100 p-8 md:p-12 mb-6 text-center studio-shadow">
         <div className="w-28 h-28 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-[2rem] mx-auto flex items-center justify-center mb-6 border border-white shadow-inner">
            <span className="text-6xl drop-shadow-sm">🎧</span>
         </div>
         <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-3 tracking-tight">Need Help?</h2>
         <p className="text-gray-500 font-bold mb-10 text-sm md:text-base max-w-sm mx-auto">We are here to resolve your issues within 10 minutes. Reach out to us anytime.</p>

         <div className="flex flex-col md:flex-row gap-4 justify-center">
            <a href="mailto:satyamsingh843484@gmail.com" className="flex-1 bg-white p-5 rounded-2xl flex items-center justify-center gap-3 hover:-translate-y-1 hover:shadow-lg transition-all border border-gray-200 group">
               <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">📧</div>
               <span className="font-black text-gray-800 text-sm md:text-base">Email Support</span>
            </a>
            <a href="tel:+918434849565" className="flex-1 bg-gray-900 text-white p-5 rounded-2xl flex items-center justify-center gap-3 hover:-translate-y-1 hover:shadow-lg hover:shadow-gray-900/20 transition-all border border-transparent">
               <span className="text-xl">📞</span>
               <span className="font-black text-sm md:text-base">Call Us Now</span>
            </a>
         </div>
      </div>
    </div>
  );
}

/* =========================================
   PRODUCT DETAIL PAGE (CLEANED - NO ADMIN CONTROLS)
========================================= */
function ProductDetailView({ product, addToCart, cart, removeFromCart, setView }) {
  if (!product) return null;
  const cartItem = cart.find(i => (i._id || i.id) === (product._id || product.id));
  const currentQty = cartItem ? cartItem.quantity : 0;
  const inrPrice = Number(product.price).toFixed(0);
  const mrp = (product.price * 1.15).toFixed(0);

  return (
    <div className="max-w-6xl mx-auto pt-8 pb-32 md:pb-20 px-4 md:px-8 animate-fade-in-up relative z-10">
      <button onClick={() => setView('home')} className="text-sm font-bold text-gray-600 mb-8 hover:text-blue-600 flex items-center gap-2 cursor-pointer bg-white px-5 py-3 rounded-xl shadow-sm border border-gray-200 transition hover:-translate-x-1 w-fit">
        <span>←</span> Back to Store
      </button>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-20 items-center">
        <div className="flex flex-col relative">
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.05)] p-8 md:p-16 flex items-center justify-center h-[350px] md:h-[500px] mb-8 relative overflow-hidden group">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-50/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            <img src={product.imagePath?.startsWith('http') ? product.imagePath : `${API_URL.replace('/api', '')}/uploads/${product.imagePath}`} alt={product.title} className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-700 drop-shadow-xl relative z-10" onError={(e) => e.target.src='https://via.placeholder.com/400'} />  
          </div>
          
          <div className="bg-white rounded-2xl flex items-center justify-between text-gray-900 border-2 border-blue-600 overflow-hidden shadow-lg shadow-blue-600/10">
            {currentQty === 0 ? (
              <button onClick={() => addToCart(product)} className="w-full py-4 md:py-5 font-black text-base md:text-xl text-blue-600 hover:bg-blue-50 transition cursor-pointer tracking-wide">
                ADD TO CART
              </button>
            ) : (
              <div className="w-full flex items-center justify-between px-6 md:px-10 py-3 md:py-4 bg-blue-600 text-white">
                <button onClick={() => removeFromCart(product._id || product.id)} className="text-3xl md:text-4xl font-light hover:scale-125 transition cursor-pointer active:scale-95">−</button>
                <span className="text-xl md:text-2xl font-black">{currentQty}</span>
                <button onClick={() => addToCart(product)} className="text-3xl md:text-4xl font-light hover:scale-125 transition cursor-pointer active:scale-95">+</button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6 md:space-y-8 flex flex-col justify-center">
          <div className="border-b border-gray-200/60 pb-8 md:pb-10">
            <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg uppercase tracking-widest mb-4 inline-block">{product.category}</span>
            <h1 className="text-4xl lg:text-6xl font-black text-gray-900 mb-4 leading-[1.1] tracking-tight">{product.title}</h1>
            <p className="text-gray-500 font-extrabold text-sm md:text-lg">1 Unit / Pack</p>
            
            <div className="mt-8 md:mt-10 flex items-end gap-4 md:gap-5">
              <span className="text-gray-900 font-black text-5xl md:text-6xl drop-shadow-sm">₹{inrPrice}</span>
              <div className="flex flex-col pb-2">
                 <span className="text-sm md:text-base text-gray-400 font-black line-through tracking-wide">MRP ₹{mrp}</span>
                 <span className="text-[10px] md:text-xs text-green-600 font-black uppercase tracking-wider mt-0.5">Price Drop Alert</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-xl mb-2 block">⚡</span>
                <h4 className="font-black text-gray-900 text-sm">Superfast</h4>
                <p className="text-[10px] text-gray-500 font-bold mt-1">Delivered in 10 minutes</p>
             </div>
             <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-xl mb-2 block">🛡️</span>
                <h4 className="font-black text-gray-900 text-sm">Quality</h4>
                <p className="text-[10px] text-gray-500 font-bold mt-1">100% genuine products</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component for the Edit Product Modal (Popup Form)
function EditProductModal({ product, onClose }) {
  const [formData, setFormData] = useState({
    title: product.title,
    price: product.price,
    category: product.category,
  });
  const [file, setFile] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('title', formData.title);
    data.append('price', formData.price);
    data.append('category', formData.category);
    if (file) { data.append('file', file); }

    try {
      const response = await fetch(`https://zippy-backend-vc4w.onrender.com/api/products/edit/${product._id || product.id}`, {
        method: 'PUT',
        body: data
      });

      if (response.ok) {
        alert("Product updated successfully!");
        window.location.reload(); 
      } else { alert("Failed to update product."); }
    } catch (error) { console.error("Error updating product:", error); }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4 animate-fade-in-up">
      <div className="bg-white p-8 rounded-[2rem] w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-white studio-shadow">
        <h2 className="text-2xl font-black text-gray-900 mb-6 tracking-tight">Edit Product</h2>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Product Title</label>
            <input type="text" name="title" value={formData.title} onChange={handleChange} required className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-xl font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-sm outline-none" />
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Price (₹)</label>
            <input type="number" name="price" value={formData.price} onChange={handleChange} required className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-xl font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-sm outline-none" />
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Category</label>
            <select name="category" value={formData.category} onChange={handleChange} required className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-xl font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-sm outline-none cursor-pointer">
              <option value="" disabled>Select Category</option>
              <option value="Fresh">Fresh</option>
              <option value="Grocery">Grocery</option>
              <option value="Electronics">Electronics</option>
              <option value="Fashion">Fashion</option>
              <option value="Beauty">Beauty</option>
              <option value="Home">Home</option>
              <option value="Kids">Kids</option>
              <option value="50% Off">50% Off</option>
              <option value="School Time">School Time</option>
              <option value="Father's Day">Father's Day</option>
            </select>
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Update Image</label>
            <input type="file" onChange={handleFileChange} className="w-full text-xs font-bold file:mr-4 file:bg-blue-50 file:text-blue-700 file:border-0 file:px-4 file:py-2.5 file:rounded-xl cursor-pointer hover:file:bg-blue-100 transition-colors bg-gray-50 border border-gray-200 rounded-xl p-2" />
          </div>
          
          <div className="flex gap-3 mt-4">
            <button type="submit" className="bg-gray-900 hover:bg-black text-white py-3.5 flex-1 rounded-xl font-black cursor-pointer transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
               Save Changes
            </button>
            <button type="button" onClick={onClose} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 py-3.5 flex-1 rounded-xl font-black cursor-pointer transition-all">
               Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================
   CART DRAWER (WITH GAMIFICATION)
========================================= */
function CartDrawer({ cart, setCart, user, setIsCartOpen, setIsAuthOpen, addToCart, removeFromCart, startTracking }) {
  const cartTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const inrTotal = parseFloat((cartTotal).toFixed(2));
  const saved = (cartTotal * 0.15).toFixed(2); 

  const [scratched, setScratched] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [discount, setDiscount] = useState(0);

  useEffect(() => {
    if (!scratched) {
      const luckyAmount = Math.floor(Math.random() * (50 - 10 + 1)) + 10;
      setWinAmount(luckyAmount);
    }
  }, [scratched]);

  const handleScratch = () => {
    setScratched(true);
    setDiscount(winAmount);
  };

  const deliveryFee = 2;
  const rawFinalAmount = inrTotal + deliveryFee - discount;
  const finalAmount = rawFinalAmount < 0 ? 0 : rawFinalAmount; 

  const handleCheckout = async () => {
    if(!user) { setIsCartOpen(false); setIsAuthOpen(true); return; }
    
    const res = await loadRazorpayScript();
    if (!res) { alert("Razorpay SDK failed to load. Are you online?"); return; }

    try {
      const orderData = await fetch(`${API_URL}/payment/create-order`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: finalAmount }) 
      }).then((t) => t.json());

      if (!orderData || !orderData.id) { alert("Server error! Cannot start payment."); return; }

      const options = {
        key: "rzp_test_T4Zw9v5VFk4BbP", 
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Zippy Groceries",
        description: `Order total after ₹${discount} Scratch Discount`,
        image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=100", 
        order_id: orderData.id,
        handler: async function (response) {
          const verifyData = await fetch(`${API_URL}/payment/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
          });

          if (verifyData.ok) {
            await fetch(`${API_URL}/orders/place`, { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerName: user.name,
                totalAmount: finalAmount, 
                cart: cart 
              })
            });

            setCart([]); 
            setIsCartOpen(false);
            startTracking(response.razorpay_payment_id); 
            
          } else {
            alert("Payment Verification Failed!");
          }
        },
        prefill: { name: user.name, email: user.email, contact: "9999999999" },
        theme: { color: "#2563eb" } 
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();

    } catch (error) { console.error(error); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-gray-900/40 backdrop-blur-sm transition-opacity">
      <div className="absolute inset-0" onClick={() => setIsCartOpen(false)}></div>
      
      <div className="w-full max-w-[420px] bg-[#fafafc] h-full shadow-[-20px_0_50px_rgba(0,0,0,0.1)] flex flex-col animate-fade-in-up relative z-10">
        <div className="bg-white px-6 py-5 flex items-center border-b border-gray-100 shadow-sm sticky top-0 z-20">
          <button onClick={() => setIsCartOpen(false)} className="text-gray-400 hover:text-gray-900 font-bold text-2xl mr-4 bg-gray-50 hover:bg-gray-100 w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer">×</button>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">My Cart</h2>
        </div>

        <div className="flex-1 overflow-y-auto pb-32 hide-scroll px-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100">
                <span className="text-6xl drop-shadow-md">🛒</span>
              </div>
              <p className="font-black text-xl text-gray-600 tracking-tight">Your cart is empty</p>
            </div>
          ) : (
            <div className="py-4 space-y-5">
              <div className="bg-green-50 text-green-700 text-xs font-black text-center py-3.5 rounded-2xl border border-green-100 shadow-sm uppercase tracking-wider">🎉 Yay! You saved ₹{saved}</div>
              
              <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden studio-shadow">
                {cart.map((item, index) => (
                  <div key={item._id || item.id || index} className={`p-4 flex gap-4 items-center ${index !== cart.length -1 ? 'border-b border-gray-50' : ''}`}>
                    <div className={`w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100 ${item.category === 'Cafe' ? 'p-0 overflow-hidden' : 'p-2'}`}>
                       <img src={getImgSrc(item.imagePath)} className={`w-full h-full ${item.category === 'Cafe' ? 'object-cover' : 'object-contain mix-blend-multiply'}`} alt={item.title} />
                    </div>
                    <div className="flex-1">
                      <h5 className="text-sm font-black text-gray-800 line-clamp-1">{item.title}</h5>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-sm font-black text-gray-900">₹{item.price}</span>
                        <span className="text-[10px] text-gray-400 line-through font-bold">₹{(item.price*1.15).toFixed(0)}</span>
                      </div>
                    </div>
                    <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 text-gray-900 font-black h-9 overflow-hidden shadow-inner">
                      <button onClick={() => removeFromCart(item._id || item.id || item.title)} className="px-3 hover:bg-gray-200 transition h-full cursor-pointer text-lg">−</button>
                      <span className="px-2 text-xs">{item.quantity}</span>
                      <button onClick={() => addToCart(item)} className="px-3 hover:bg-gray-200 transition h-full cursor-pointer text-lg">+</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 🎁 GAMIFICATION */}
              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-1 rounded-[1.5rem] shadow-[0_10px_20px_rgba(79,70,229,0.2)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/20 rounded-full blur-2xl pointer-events-none"></div>
                <div className="bg-white/10 backdrop-blur-md p-5 rounded-[1.2rem] border border-white/20">
                   <h4 className="font-black text-white text-sm mb-3 flex items-center gap-2 drop-shadow-md">
                     ✨ Scratch & Win Discount!
                   </h4>
                   
                   {!scratched ? (
                     <div 
                       onClick={handleScratch}
                       className="w-full h-16 scratch-card-pattern rounded-xl cursor-pointer flex items-center justify-center relative overflow-hidden shadow-inner border-2 border-white/50 transform active:scale-95 transition-transform"
                     >
                        <div className="absolute inset-0 bg-white/20 group-hover:bg-white/0 transition-all"></div>
                        <span className="text-gray-800 font-black tracking-widest text-xs drop-shadow-[0_2px_2px_rgba(255,255,255,0.8)] z-10 flex items-center gap-2">
                           🪙 CLICK TO SCRATCH
                        </span>
                     </div>
                   ) : (
                     <div className="w-full h-16 bg-gradient-to-r from-green-400 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg border border-white/50 animate-pop-in text-white relative overflow-hidden">
                         <div className="absolute inset-0 bg-white opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:10px_10px]"></div>
                         <span className="font-black text-base tracking-wide drop-shadow-md z-10 flex items-center gap-2">
                           🎉 YOU WON ₹{winAmount} OFF!
                         </span>
                     </div>
                   )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 studio-shadow">
                <h4 className="font-black text-sm text-gray-900 mb-5 flex items-center gap-2 uppercase tracking-wider">📄 Bill Summary</h4>
                <div className="space-y-4 text-sm font-bold text-gray-500">
                  <div className="flex justify-between"><span>Item Total</span><span className="text-gray-800">₹{inrTotal}</span></div>
                  <div className="flex justify-between border-b border-gray-100 pb-4"><span>Delivery Fee</span><span className="text-gray-800">₹{deliveryFee}</span></div>
                  
                  {discount > 0 && (
                     <div className="flex justify-between text-green-600 bg-green-50 p-3 rounded-xl border border-green-100 animate-fade-in-up">
                        <span className="flex items-center gap-1 font-black">🎟️ Lucky Discount</span>
                        <span className="font-black">-₹{discount}</span>
                     </div>
                  )}

                  <div className="flex justify-between text-lg font-black text-gray-900 pt-1">
                    <span>To Pay</span>
                    <span className="text-blue-600 drop-shadow-sm">₹{finalAmount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="absolute bottom-0 w-full bg-white/90 backdrop-blur-xl p-5 border-t border-gray-100 shadow-[0_-20px_40px_rgba(0,0,0,0.05)] z-30">
            <button onClick={handleCheckout} className="w-full bg-gray-900 text-white font-black py-4 md:py-5 rounded-2xl shadow-[0_10px_20px_rgba(0,0,0,0.15)] hover:bg-black hover:-translate-y-1 transition-all flex justify-between px-8 text-base md:text-lg cursor-pointer">
               <span>{user ? 'Proceed to Pay' : 'Login to Proceed'}</span>
               <span>₹{finalAmount} <span className="ml-2 font-normal">→</span></span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================
   AUTH COMPONENT
========================================= */
function AuthComponent({ onLogin }) {
  const [step, setStep] = useState(1); 
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('CUSTOMER');

  const sendOtp = (e) => {
    e.preventDefault();
    if (phone.length < 10) return alert("Please enter a valid 10-digit number");
    const fakeOtp = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedOtp(fakeOtp);
    alert(`[MOCK SMS] 📱 Your Zippy verification code is: ${fakeOtp}`);
    setStep(2);
  };

  const verifyOtpAndLogin = async (e) => {
    e.preventDefault();
    if (otp !== generatedOtp) return alert("❌ Incorrect OTP! Please try again.");
    const mockEmail = `${phone}@zippy.com`;
    const mockPassword = phone; 
    try {
      const loginRes = await fetch(`${API_URL}/auth/login?email=${mockEmail}&password=${mockPassword}`, { method: 'POST' });
      if (loginRes.ok) { onLogin(await loginRes.json()); } else {
        const regRes = await fetch(`${API_URL}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name || 'Zippy User', email: mockEmail, role: role, password: mockPassword }) });
        if (regRes.ok) { const newLoginRes = await fetch(`${API_URL}/auth/login?email=${mockEmail}&password=${mockPassword}`, { method: 'POST' }); onLogin(await newLoginRes.json()); }
      }
    } catch (error) { console.error("Auth Error Mobile:", error); alert("Login Error: Is your backend running and accessible on this network?"); }
  };

  return (
    <>
      <div className="hidden md:flex flex-col w-2/5 bg-gray-900 p-12 text-white justify-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80')] opacity-20 bg-cover bg-center mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
        <div className="relative z-10">
           <h1 className="text-5xl font-black tracking-tighter mb-4 drop-shadow-lg text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">zippy</h1>
           <h2 className="text-3xl font-black leading-tight mb-2 drop-shadow-md">Groceries in<br/><span className="text-yellow-400">10 Minutes</span></h2>
           <p className="text-gray-400 font-bold mt-4 text-sm">Join the fastest delivery network in your city.</p>
        </div>
      </div>
      
      <div className="w-full md:w-3/5 p-8 md:p-14 flex flex-col justify-center bg-white relative">
        {step === 1 ? (
          <div className="w-full animate-fade-in-up">
            <div className="mb-8">
               <h3 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">Get Started</h3>
               <p className="text-sm text-gray-500 font-bold mt-2">Enter your phone number to login or register</p>
            </div>
            <form onSubmit={sendOtp} className="space-y-5 w-full">
              <div className="flex items-center glass-input rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                <div className="bg-gray-50 px-4 py-4 border-r border-gray-200 font-black text-gray-700 whitespace-nowrap">🇮🇳 +91</div>
                <input type="tel" maxLength="10" required placeholder="Mobile Number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className="w-full bg-transparent px-4 py-4 text-lg font-black text-gray-900 focus:outline-none tracking-widest" />
              </div>
              <div className="flex flex-col md:flex-row gap-4">
                <input type="text" placeholder="Your Name" value={name} onChange={(e)=>setName(e.target.value)} className="w-full glass-input border border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none shadow-sm" />
                <select value={role} onChange={(e)=>setRole(e.target.value)} className="w-full glass-input border border-gray-100 rounded-2xl px-4 py-4 text-sm font-bold focus:outline-none cursor-pointer shadow-sm text-gray-700">
                  <option value="CUSTOMER">Customer</option>
                  <option value="SELLER">Partner</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-gray-900 text-white font-black py-4 md:py-5 rounded-2xl shadow-[0_10px_20px_rgba(0,0,0,0.15)] hover:-translate-y-1 hover:bg-black transition-all cursor-pointer mt-4 text-base md:text-lg">Send Verification Code</button>
            </form>
          </div>
        ) : (
          <div className="w-full animate-fade-in-up">
            <button onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-900 font-black text-xs md:text-sm mb-6 bg-gray-50 hover:bg-gray-100 px-4 py-2 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-2">← Change Number</button>
            <div className="mb-8">
               <h3 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">Verify OTP</h3>
               <p className="text-sm text-gray-500 font-bold mt-2">We've sent a secure code to +91 {phone}</p>
            </div>
            <form onSubmit={verifyOtpAndLogin} className="space-y-6 w-full">
              <input type="text" maxLength="4" required placeholder="• • • •" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="w-full glass-input border border-gray-100 rounded-2xl px-4 py-5 text-center text-3xl font-black tracking-[1em] focus:outline-none shadow-inner" />
              <button type="submit" className="w-full bg-blue-600 text-white font-black py-4 md:py-5 rounded-2xl shadow-[0_10px_20px_rgba(37,99,235,0.2)] hover:-translate-y-1 hover:bg-blue-700 transition-all cursor-pointer text-base md:text-lg">Verify & Secure Login</button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

/* =========================================
   PENDING APPROVAL VIEW 
========================================= */
function PendingApprovalView({ onLogout }) {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[30rem] h-[30rem] bg-yellow-200/30 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="bg-white p-10 md:p-14 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] max-w-lg w-full text-center border border-white studio-shadow animate-pop-in relative z-10">
        <div className="w-28 h-28 bg-gradient-to-br from-yellow-50 to-orange-50 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-8 text-5xl shadow-inner border border-yellow-100">⏳</div>
        <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Account Under Review</h2>
        <p className="text-gray-500 mb-10 font-bold leading-relaxed text-sm md:text-base">Welcome to Zippy! Your partner application is safely with us. Our team reviews profiles to maintain top-tier platform quality. We'll notify you soon.</p>
        <button onClick={onLogout} className="w-full py-4 md:py-5 bg-gray-900 hover:bg-black text-white rounded-2xl font-black transition-all shadow-[0_10px_20px_rgba(0,0,0,0.1)] cursor-pointer hover:-translate-y-1 text-base">Logout & Check Later</button>
      </div>
    </div>
  );
}

/* =========================================
   GOD MODE: SUPER ADMIN DASHBOARD
========================================= */
function AdminDashboardView({ user, onLogout }) {
  const [pendingSellers, setPendingSellers] = useState([]);

  const fetchPendingSellers = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/pending-sellers`);
      const data = await res.json();
      setPendingSellers(data);
    } catch (err) { console.error("Error fetching sellers:", err); }
  };

  useEffect(() => { fetchPendingSellers(); }, []);

  const handleApprove = async (sellerId) => {
    const isConfirmed = window.confirm("Approve this partner for the Zippy Platform?");
    if (!isConfirmed) return;
    try {
      const res = await fetch(`${API_URL}/admin/approve-seller/${sellerId}`, { method: 'PUT' });
      if (res.ok) {
        alert("Partner Approved Successfully! 🚀");
        setPendingSellers(pendingSellers.filter(s => s._id !== sellerId));
      } else { alert("Something went wrong!"); }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="min-h-screen pb-20 relative z-10 selection:bg-blue-200">
      <div className="absolute top-0 left-0 w-full h-96 bg-gray-900 -z-10"></div>
      
      <div className="max-w-[1400px] mx-auto py-10 px-4 md:px-8 animate-fade-in-up">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 mt-4">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-3xl shadow-[0_10px_20px_rgba(37,99,235,0.3)] border border-white/20">👑</div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Command Center</h1>
              <p className="text-gray-400 font-bold mt-1 tracking-wider uppercase text-xs">Super Admin Privilege</p>
            </div>
          </div>
          <button onClick={onLogout} className="mt-6 md:mt-0 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-6 py-3 rounded-xl font-black transition-all backdrop-blur-md cursor-pointer text-sm">
            Exit Protocol
          </button>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden studio-shadow border border-white">
          <div className="bg-gray-50 border-b border-gray-100 px-8 md:px-10 py-6 md:py-8 flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
              Pending Partner Approvals 
              <span className="bg-yellow-100 text-yellow-700 text-sm px-3 py-1 rounded-lg shadow-sm border border-yellow-200">{pendingSellers.length}</span>
            </h2>
          </div>

          <div className="p-8 md:p-10">
            {pendingSellers.length === 0 ? (
              <div className="text-center py-16 flex flex-col items-center">
                <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-6 border border-gray-100 shadow-sm">
                  <span className="text-5xl opacity-40">☕</span>
                </div>
                <h3 className="text-2xl font-black text-gray-800 tracking-tight">Platform is Optimized</h3>
                <p className="text-gray-500 font-bold mt-2 text-sm">No pending requests in the queue.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {pendingSellers.map((seller) => (
                  <div key={seller._id} className="bg-white border border-gray-100 rounded-[1.5rem] p-6 shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.06)] transition-all duration-300 flex flex-col group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-2xl -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-2xl font-black text-gray-400 mb-5 uppercase border border-gray-100 shadow-inner group-hover:scale-105 transition-transform relative z-10">
                      {seller.name.charAt(0)}
                    </div>
                    <h3 className="font-black text-xl text-gray-900 tracking-tight relative z-10">{seller.name}</h3>
                    <p className="text-gray-500 font-bold text-xs mb-8 relative z-10">{seller.email}</p>
                    
                    <button 
                      onClick={() => handleApprove(seller._id)} 
                      className="mt-auto w-full bg-gray-900 hover:bg-black text-white font-black py-3.5 rounded-xl shadow-md hover:shadow-[0_10px_20px_rgba(0,0,0,0.15)] hover:-translate-y-0.5 transition-all cursor-pointer relative z-10 text-sm"
                    >
                      Approve Partner
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================
   PREMIUM SELLER DASHBOARD
========================================= */
function SellerDashboard({ user, onLogout }) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [newProduct, setNewProduct] = useState({ title: '', price: '', category: 'Fresh', file: null });
  const [editingProduct, setEditingProduct] = useState(null);

  const loadData = () => {
    fetch(`${API_URL}/products/all`).then(res => res.json()).then(data => setProducts(data.filter(p => p.sellerId === user.id)));
    fetch(`${API_URL}/orders/seller/${user.id}`).then(res => res.json()).then(data => setOrders(data.reverse()));
  };
  
  useEffect(() => { 
    loadData(); 
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', newProduct.title);
    formData.append('price', newProduct.price);
    formData.append('category', newProduct.category);
    formData.append('file', newProduct.file);
    formData.append('sellerId', user.id);

    await fetch(`${API_URL}/products/upload`, { method: 'POST', body: formData });
    setNewProduct({ title: '', price: '', category: 'Fresh', file: null }); 
    loadData();
  };

  const updateOrderStatus = async (orderId, status) => {
    await fetch(`${API_URL}/orders/update?orderId=${orderId}&status=${status}`, { method: 'POST' }); 
    loadData();
  };

  const handleDelete = async (productId) => {
    if (!window.confirm("Delete this product from your inventory?")) return;
    try {
      const response = await fetch(`${API_URL}/products/delete/${productId}`, { method: 'DELETE' });
      if (response.ok) { alert("Product deleted! 🗑️"); loadData(); }
    } catch (error) { console.error("Error deleting:", error); }
  };

  const handleEditClick = (product) => { setEditingProduct(product); };
  const activeOrders = orders.filter(o => o.status !== 'DELIVERED').length;

  return (
    <div className="min-h-screen pb-24 md:pb-20 relative z-10 selection:bg-indigo-200">
      
      {editingProduct && <EditProductModal product={editingProduct} onClose={() => { setEditingProduct(null); loadData(); }} />}

      <div className="absolute top-0 left-0 w-full h-96 bg-gray-900 -z-10"></div>

      <div className="max-w-[1400px] mx-auto py-8 md:py-10 px-4 md:px-8 w-full space-y-8 animate-fade-in-up relative z-20">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-[0_10px_20px_rgba(79,70,229,0.3)] border border-white/20">
               <span className="text-3xl text-white">⚡</span>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Partner Central</h1>
              <p className="text-indigo-200 font-bold mt-1 text-sm tracking-wide">Business Dashboard • {user.name}</p>
            </div>
          </div>
          <button onClick={onLogout} className="mt-6 md:mt-0 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-6 py-3 rounded-xl font-black transition-all backdrop-blur-md cursor-pointer text-sm shadow-sm hover:shadow-lg">
            Secure Logout
          </button>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
           <div className="bg-white rounded-[2rem] p-6 md:p-8 studio-shadow border border-white relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <h4 className="text-gray-400 font-black text-[10px] uppercase tracking-widest mb-2 relative z-10">Total Orders</h4>
              <span className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight relative z-10">{orders.length}</span>
           </div>
           
           <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[2rem] p-6 md:p-8 shadow-[0_15px_30px_rgba(79,70,229,0.2)] relative overflow-hidden transform hover:-translate-y-1 transition-transform border border-indigo-500">
              <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              <h4 className="text-indigo-200 font-black text-[10px] uppercase tracking-widest mb-2 relative z-10">Active Action Req.</h4>
              <span className="text-4xl md:text-5xl font-black text-white tracking-tight relative z-10">{activeOrders}</span>
           </div>

           <div className="bg-white rounded-[2rem] p-6 md:p-8 studio-shadow border border-white relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-rose-50 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <h4 className="text-gray-400 font-black text-[10px] uppercase tracking-widest mb-2 relative z-10">Live Inventory</h4>
              <span className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight relative z-10">{products.length}</span>
           </div>
        </div>
        
        {/* INVENTORY FORM */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden studio-shadow">
          <div className="bg-gray-50 border-b border-gray-100 px-6 md:px-10 py-6 flex items-center justify-between">
             <h3 className="font-black text-gray-900 text-lg md:text-xl flex items-center gap-3 tracking-tight">
               <span className="bg-white shadow-sm border border-gray-200 p-2 rounded-xl text-sm">➕</span> Restock Inventory
             </h3>
          </div>
          <div className="p-6 md:p-10">
            <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-5 gap-5 items-end">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Item Name</label>
                <input type="text" required value={newProduct.title} onChange={(e) => setNewProduct({...newProduct, title: e.target.value})} className="h-[55px] bg-white border border-gray-200 px-5 rounded-2xl w-full font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all text-sm outline-none shadow-sm" placeholder="e.g. Fresh Apples" />
              </div>
              
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Category</label>
                <select value={newProduct.category} onChange={(e) => setNewProduct({...newProduct, category: e.target.value})} className="h-[55px] bg-white border border-gray-200 px-5 rounded-2xl w-full font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all text-sm cursor-pointer outline-none shadow-sm text-gray-700">
                  <option value="Fresh">Fresh</option><option value="Grocery">Grocery</option><option value="Electronics">Electronics</option><option value="Fashion">Fashion</option><option value="Beauty">Beauty</option><option value="Home">Home</option><option value="Kids">Kids</option><option value="50% Off">50% Off</option><option value="School Time">School Time</option><option value="Father's Day">Father's Day</option>
                </select>
              </div>

              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Price (₹)</label>
                <input type="number" required value={newProduct.price} onChange={(e) => setNewProduct({...newProduct, price: e.target.value})} className="h-[55px] bg-white border border-gray-200 px-5 rounded-2xl w-full font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all text-sm outline-none shadow-sm" placeholder="0.00" />
              </div>

              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Image File</label>
                <div className="h-[55px] bg-white border border-gray-200 rounded-2xl w-full flex items-center px-2 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-50 transition-all overflow-hidden shadow-sm">
                  <input type="file" required onChange={(e) => setNewProduct({...newProduct, file: e.target.files[0]})} className="w-full text-[11px] font-bold file:mr-3 file:bg-indigo-50 file:text-indigo-700 file:border-0 file:px-3 file:py-2 file:rounded-xl cursor-pointer hover:file:bg-indigo-100 transition-colors" />
                </div>
              </div>

              <button type="submit" className="md:col-span-5 h-[55px] bg-gray-900 text-white rounded-2xl font-black hover:bg-black hover:shadow-[0_10px_20px_rgba(0,0,0,0.15)] hover:-translate-y-1 transition-all cursor-pointer text-base mt-2">
                Publish Item to Store
              </button>
            </form>
          </div>
        </div>

        {/* LIVE INVENTORY */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden studio-shadow">
          <div className="bg-gray-50 border-b border-gray-100 px-6 md:px-10 py-6 flex justify-between items-center sticky top-0 z-10">
             <h3 className="font-black text-gray-900 text-lg md:text-xl flex items-center gap-3 tracking-tight">
               <span className="bg-white shadow-sm border border-gray-200 p-2 rounded-xl text-sm">⚙️</span> Manage Inventory
             </h3>
          </div>
          <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5 max-h-[500px] overflow-y-auto hide-scroll">
            {products.map(p => (
              <div key={p._id} className="bg-white p-4 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 transition-all group">
                <div>
                  <div className="h-32 w-full bg-gray-50 rounded-xl flex items-center justify-center mb-4 overflow-hidden border border-gray-100/50 group-hover:bg-blue-50/30 transition-colors">
                    <img src={p.imagePath?.startsWith('http') ? p.imagePath : `${API_URL.replace('/api', '')}/uploads/${p.imagePath}`} alt={p.title} className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform" onError={(e) => e.target.src='https://via.placeholder.com/150'} /> 
                  </div>
                  <h4 className="font-black text-sm text-gray-900 line-clamp-2 leading-tight">{p.title}</h4>
                  <p className="text-gray-900 font-black text-lg mb-5 mt-2">₹{p.price}</p>
                </div>
                
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => handleEditClick(p)} className="flex-1 bg-gray-50 border border-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-xs hover:bg-gray-900 hover:text-white transition-all cursor-pointer">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(p._id || p.id)} className="flex-1 bg-rose-50 border border-rose-100 text-rose-600 font-bold py-2.5 rounded-xl text-xs hover:bg-rose-600 hover:text-white transition-all cursor-pointer">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            
            {products.length === 0 && (
              <div className="col-span-full text-center py-16">
                <p className="text-gray-500 font-bold">Your inventory is empty. Start adding items above!</p>
              </div>
            )}
          </div>
        </div>

        {/* ORDERS FEED */}
        <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-hidden border border-white studio-shadow">
          <div className="bg-gray-50 border-b border-gray-100 px-6 md:px-10 py-6 flex justify-between items-center sticky top-0 z-10">
             <h3 className="font-black text-gray-900 text-lg md:text-xl flex items-center gap-3 tracking-tight">
               <span className="bg-white shadow-sm border border-gray-200 p-2 rounded-xl text-sm relative">
                  📦 <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-white"></span></span>
               </span> 
               Live Orders Feed
             </h3>
          </div>
          <div className="p-6 md:p-8 grid gap-5 max-h-[700px] overflow-y-auto hide-scroll">
            {orders.map(o => (
              <div key={o._id} className={`flex flex-col bg-white p-6 md:p-8 rounded-[2rem] border ${o.status === 'DELIVERED' ? 'border-gray-100 opacity-70 bg-gray-50/50' : 'border-indigo-100 shadow-[0_10px_30px_rgba(79,70,229,0.05)] hover:shadow-[0_15px_40px_rgba(79,70,229,0.1)]'} transition-all duration-300 gap-6`}>
                
                <div className="flex flex-col md:flex-row justify-between md:items-start md:items-center gap-5">
                  <div className="flex items-center gap-5">
                     <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner border ${o.status === 'DELIVERED' ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                       {o.customerName.charAt(0)}
                     </div>
                     <div>
                       <div className="flex items-center gap-3 mb-1">
                         <h4 className="font-black text-xl md:text-2xl text-gray-900 tracking-tight">{o.customerName}</h4>
                         <span className="text-[10px] font-black text-gray-500 bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-lg uppercase tracking-widest">#{o._id ? o._id.substring(o._id.length - 6) : '---'}</span>
                       </div>
                       <p className="text-gray-900 font-black text-lg">₹{Number(o.totalAmount).toFixed(0)}</p>
                     </div>
                  </div>

                  <div className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4 mt-2 md:mt-0 w-full md:w-auto">
                     <span className={`font-black tracking-widest text-[10px] px-5 py-3.5 rounded-xl border w-full md:w-auto text-center uppercase
                       ${o.status === 'RECEIVED' ? 'bg-rose-50 text-rose-600 border-rose-200 shadow-inner' : 
                         o.status === 'PACKING' ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-inner' : 
                         o.status === 'DISPATCHED' ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-inner' : 
                         'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-inner'}`}
                     >
                       {o.status}
                     </span>
                     
                     {o.status === 'RECEIVED' && (
                       <button onClick={() => updateOrderStatus(o._id, 'PACKING')} className="bg-gray-900 text-white px-8 py-3.5 rounded-xl shadow-lg hover:-translate-y-1 hover:bg-black transition-all w-full md:w-auto cursor-pointer font-black text-sm">Start Packing</button>
                     )}
                     {o.status === 'PACKING' && (
                       <button onClick={() => updateOrderStatus(o._id, 'DISPATCHED')} className="bg-indigo-600 text-white px-8 py-3.5 rounded-xl shadow-[0_10px_20px_rgba(79,70,229,0.3)] hover:-translate-y-1 hover:bg-indigo-700 transition-all w-full md:w-auto cursor-pointer font-black text-sm">Dispatch Rider</button>
                     )}
                     {o.status === 'DISPATCHED' && (
                       <button onClick={() => updateOrderStatus(o._id, 'DELIVERED')} className="bg-emerald-500 text-white px-8 py-3.5 rounded-xl shadow-[0_10px_20px_rgba(16,185,129,0.3)] hover:-translate-y-1 hover:bg-emerald-600 transition-all w-full md:w-auto cursor-pointer font-black text-sm">Mark Delivered</button>
                     )}
                  </div>
                </div>

                {o.items && o.items.length > 0 && (
                  <div className="pt-5 border-t border-gray-100">
                    <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Items to Pack</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {o.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 bg-gray-50/80 p-3 rounded-2xl border border-gray-100 hover:bg-white hover:shadow-sm transition-colors">
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-sm border border-gray-100 shrink-0">
                            <img src={item.imagePath?.startsWith('http') ? item.imagePath : `${API_URL.replace('/api', '')}/uploads/${item.imagePath}`} alt={item.title} className="w-full h-full object-contain mix-blend-multiply" onError={(e) => e.target.src='https://via.placeholder.com/50'} />
                          </div>
                          <div className="flex-1">
                            <h6 className="text-sm font-bold text-gray-800 line-clamp-1">{item.title}</h6>
                            <p className="text-xs font-black text-indigo-600 mt-0.5 bg-indigo-50 w-fit px-2 py-0.5 rounded-md">Qty: {item.quantity}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {orders.length === 0 && (
              <div className="text-center py-20 flex flex-col items-center">
                <div className="w-28 h-28 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-5 border border-gray-100 shadow-sm">
                   <span className="text-5xl opacity-40">☕</span>
                </div>
                <h3 className="text-2xl font-black text-gray-800 tracking-tight">No active orders yet</h3>
                <p className="text-gray-500 font-bold mt-2 text-sm">Grab a coffee while you wait.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

/* =========================================
   ACCOUNT VIEW (PREMIUM ITEM DETAILS)
========================================= */
function AccountView({ user, onLogout, setView }) {
  const [myOrders, setMyOrders] = useState([]);

  const fetchMyOrders = () => {
    fetch(`${API_URL}/orders/all`).then(res => res.json()).then(data => {
        const userOrders = data.filter(o => o.customerName === user.name);
        setMyOrders(userOrders.sort((a, b) => b._id.localeCompare(a._id)));
      }).catch(err => console.error(err));
  };

  useEffect(() => {
    fetchMyOrders();
    const interval = setInterval(fetchMyOrders, 3000);
    return () => clearInterval(interval);
  }, []);

  const getProgress = (status) => {
    if (status === 'RECEIVED') return 25;
    if (status === 'PACKING') return 50;
    if (status === 'DISPATCHED') return 75;
    if (status === 'DELIVERED') return 100;
    return 10;
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto pt-8 pb-32 px-4 md:px-8 animate-fade-in-up relative z-10">
      <div className="flex items-center gap-4 mb-10">
        <button onClick={() => setView('home')} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-gray-200 font-bold text-xl hover:bg-gray-50 transition cursor-pointer hover:-translate-x-1">←</button>
        <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">My Profile</h1>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-gray-100 p-8 md:p-12 mb-8 studio-shadow">
        <div className="flex items-center gap-6 mb-10 border-b border-gray-100 pb-10">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 rounded-[2rem] flex items-center justify-center text-4xl font-black uppercase border border-white shadow-inner">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight leading-none mb-2">{user.name}</h2>
            <p className="text-gray-500 font-bold">{user.email}</p>
            <span className="inline-block mt-3 bg-green-50 border border-green-200 text-green-700 text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-sm">Verified Customer</span>
          </div>
        </div>

        <h3 className="font-black text-2xl text-gray-900 mb-6 tracking-tight">Order History</h3>
        <div className="space-y-6">
          {myOrders.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
               <span className="text-5xl block mb-4 opacity-40">🍿</span>
               <span className="text-gray-500 font-bold text-base">No orders placed yet. Time to grab some snacks!</span>
            </div>
          ) : (
            myOrders.map(o => (
              <div key={o._id} className="p-6 md:p-8 bg-white border border-gray-100 rounded-[2rem] shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.05)] transition-shadow">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">Order #{o._id ? o._id.substring(o._id.length - 6) : '---'}</span>
                    <h4 className="font-black text-2xl text-gray-900 mt-3">₹{Number(o.totalAmount).toFixed(0)}</h4>
                  </div>
                  <span className={`text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest shadow-inner ${o.status === 'DELIVERED' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                    {o.status}
                  </span>
                </div>

                {o.items && o.items.length > 0 && (
                  <div className="my-6 bg-gray-50/80 rounded-[1.5rem] p-5 border border-gray-100/80">
                    <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Items in this packet</h5>
                    <div className="space-y-4">
                      {o.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-gray-50">
                          <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center p-1.5 border border-gray-100 shrink-0">
                            <img src={getImgSrc(item.imagePath)} alt={item.title} className="w-full h-full object-contain mix-blend-multiply" onError={(e) => e.target.src='https://via.placeholder.com/50'} />
                          </div>
                          <div className="flex-1">
                            <h6 className="text-sm font-black text-gray-800 line-clamp-1 mb-1">{item.title}</h6>
                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider">Qty: {item.quantity}</span>
                          </div>
                          <span className="text-base font-black text-gray-900 pr-2">₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div className="flex justify-between text-[10px] md:text-xs font-black uppercase tracking-wider text-gray-300 mb-3">
                    <span className={getProgress(o.status) >= 25 ? 'text-gray-900 drop-shadow-sm' : ''}>Placed</span>
                    <span className={getProgress(o.status) >= 50 ? 'text-blue-600 drop-shadow-sm' : ''}>Packing</span>
                    <span className={getProgress(o.status) >= 75 ? 'text-blue-600 drop-shadow-sm' : ''}>Dispatched</span>
                    <span className={getProgress(o.status) === 100 ? 'text-green-600 drop-shadow-sm' : ''}>Delivered</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden shadow-inner">
                    <div 
                      className={`h-3 rounded-full transition-all duration-1000 ease-out shadow-sm ${o.status === 'DELIVERED' ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-blue-400 to-indigo-500'}`} 
                      style={{ width: `${getProgress(o.status)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <button onClick={onLogout} className="w-full bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-600 hover:text-white transition-all font-black py-5 rounded-[1.5rem] text-lg shadow-sm hover:shadow-[0_10px_20px_rgba(225,29,72,0.2)] cursor-pointer hover:-translate-y-1">
        Secure Logout
      </button>
    </div>
  );
}

/* =========================================
   FOOTER COMPONENT
========================================= */
function Footer() {
  return (
    <footer className="w-full bg-[#f8fafc] pt-16 pb-40 md:pb-20 mt-4 border-t border-gray-100">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 flex flex-col items-center md:items-start text-center md:text-left">
        <h1 className="text-[48px] md:text-[64px] font-black tracking-[-0.06em] text-gray-300 leading-none mb-2 lowercase" style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
          zippy
        </h1>
        <p className="text-[14px] md:text-[16px] font-bold text-gray-400 flex items-center justify-center md:justify-start tracking-tight uppercase" style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
          Crafted with 
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px] md:w-[17px] md:h-[17px] mx-1.5 text-blue-500">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          in Patna, India
        </p>
      </div>
    </footer>
  );
}