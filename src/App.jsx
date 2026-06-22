import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client'; // <--- YAHAN ADD HOGA IMPORT
const HOST = window.location.hostname;
const API_URL = `https://zippy-backend-vc4w.onrender.com/api`;
const socket = io(`https://zippy-backend-vc4w.onrender.com`); // <--- YAHAN ADD HOGA SOCKET CONNECTION
// 👇👇 BAS YE 4 LINES YAHAN PASTE KAR DO 👇👇
const getImgSrc = (path) => {
  if (!path) return 'https://via.placeholder.com/150';
  return path.startsWith('http') ? path : `http://${HOST}:8080/uploads/${path}`;
};
// 👆👆 =================================== 👆👆

// Razorpay ka popup kholne ke liye script load karna padta hai
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};
// 👆👆 =================================== 👆👆

export default function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('zippy_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  const [view, setView] = useState(() => {
    const savedUser = localStorage.getItem('zippy_user');
    return savedUser ? (JSON.parse(savedUser).role === 'SELLER' ? 'seller' : 'home') : 'home';
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // 1. App load hote hi pehle LocalStorage check karo
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

  // 2. Jaise hi Cart mein kuch change ho, usko LocalStorage mein save kar do
  useEffect(() => {
    localStorage.setItem('zippy_cart', JSON.stringify(cart));
  }, [cart]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState('All');
  const [location, setLocation] = useState("Bhagalpur, Bihar");
  const [customLocationInput, setCustomLocationInput] = useState("");
  const [isChangingLocation, setIsChangingLocation] = useState(false);

  // 👇👇 YAHAN PAR PASTE KARNA HAI 👇👇

  // --- NAYA SEARCH ENGINE LOGIC ---
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
  // --------------------------------

  // 👆👆 IS LINE KE THEEK UPAR 👆👆
  
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
    if(userData.role === 'SELLER') { setView('seller'); setCart([]); } 
    else { setView('home'); }
  };

  const handleLogout = () => {
    setUser(null); localStorage.removeItem('zippy_user'); setCart([]); setView('home');
  };

  // --- SMART ADD TO CART (FIXED FOR MONGODB _ID & CAFE ID) ---
  // --- BUG-FREE SMART CART LOGIC ---
  const getUniversalId = (item) => String(item._id || item.id || item.title);

  const addToCart = (product) => {
    setCart((prev) => {
      // 1. Naye product ki universal ID nikalo
      const incomingId = getUniversalId(product);
      
      // 2. Check karo ki cart mein ye exact ID hai ya nahi
      const existingItem = prev.find(item => getUniversalId(item) === incomingId);
      
      // 3. Agar hai, toh SIRF usi specific item ki quantity badhao
      if (existingItem) {
        return prev.map(item => 
          getUniversalId(item) === incomingId 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      
      // 4. Agar naya item hai, toh cart mein fresh entry karo
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId) => {
    const targetId = String(productId); // ID ko strict string bana do
    setCart((prev) => 
      prev.map(item => 
        getUniversalId(item) === targetId 
          ? { ...item, quantity: item.quantity - 1 } 
          : item
      ).filter(item => item.quantity > 0)
    );
  };
  // ---------------------------------

  const openProduct = (product) => {
    setSelectedProduct(product);
    setView('product');
  };

  const cartItemCount = cart.reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900 font-sans overflow-x-hidden selection:bg-blue-200 selection:text-blue-900 pb-28 md:pb-0 relative z-0">
      
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.6s ease-out forwards; }
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
          50% { transform: translateY(-20px) rotate(5deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        .animate-float { animation: float 10s ease-in-out infinite; }
      `}</style>

      {/* --- AESTHETIC BACKGROUND BLOBS --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-[100px] opacity-60 animate-float"></div>
        <div className="absolute top-1/4 -right-32 w-96 h-96 bg-rose-100 rounded-full mix-blend-multiply filter blur-[100px] opacity-60 animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* --- DESKTOP NAVBAR --- */}
      <nav className="hidden md:block bg-white/80 backdrop-blur-xl px-4 md:px-8 py-3.5 sticky top-0 z-40 border-b border-gray-200/60 shadow-sm transition-all">
        <div className="flex justify-between items-center max-w-[1400px] mx-auto">
          <div className="flex items-center space-x-8">
            <div className="flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform" onClick={() => { if(user?.role !== 'SELLER') { setActiveCategory('All'); setView('home'); setSelectedProduct(null); } }}>
              <span className="text-4xl font-black tracking-tighter text-blue-600">zippy</span>
            </div>
            {user?.role !== 'SELLER' && (
              <div className="flex flex-col border-l border-gray-200 pl-6 cursor-pointer group" onClick={() => setIsChangingLocation(!isChangingLocation)}>
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider group-hover:text-blue-600 transition flex items-center gap-1">
                  Delivery Location <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </span>
                <span className="text-[15px] font-bold text-gray-800 truncate w-56">{location}</span>
              </div>
            )}
          </div>
          {user?.role !== 'SELLER' && (
            <div className="flex-1 max-w-2xl mx-8 relative z-50">
               <div className="w-full flex items-center bg-gray-100/80 rounded-2xl px-5 py-3 border border-transparent focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-[0_4px_20px_rgba(37,99,235,0.1)] transition-all">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                 <input type="text" placeholder="Search for 'Apple', 'Milk'..." value={searchQuery} onChange={handleSearchChange} onFocus={() => searchQuery && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className="w-full bg-transparent focus:outline-none ml-3 text-sm font-bold text-gray-800" />
               </div>
               
               {/* LIVE SUGGESTIONS DROPDOWN */}
               {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-2 animate-fade-in-up">
                     {searchSuggestions.map(item => (
                        <div key={item._id} onClick={() => { openProduct(item); setSearchQuery(''); setShowSuggestions(false); }} className="px-5 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group transition-colors">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center p-1 border border-gray-100"><img src={getImgSrc(item.imagePath)} className="max-w-full max-h-full object-contain mix-blend-multiply" alt=""/></div>
                              <div>
                                <p className="text-sm font-black text-gray-800 group-hover:text-blue-600 transition">{item.title}</p>
                                <span className="text-[10px] font-bold text-gray-400 uppercase">{item.category}</span>
                              </div>
                           </div>
                           <span className="text-sm font-black text-gray-900">₹{item.price}</span>
                        </div>
                     ))}
                  </div>
               )}
            </div>
          )}
          <div className="flex items-center space-x-8">
            {!user ? (
              <button onClick={() => setIsAuthOpen(true)} className="font-bold text-gray-600 hover:text-blue-600 transition cursor-pointer">Login</button>
            ) : (
              <div className="flex flex-col items-end cursor-pointer group" onClick={() => user.role !== 'SELLER' ? setView('account') : null} title="Go to Account">
                <span className="text-xs font-bold text-gray-500">Welcome,</span>
                <span className="text-sm font-black text-blue-600 group-hover:text-blue-800 transition flex items-center gap-1">{user.name}</span>
              </div>
            )}
            {user?.role !== 'SELLER' && (
              <button onClick={() => setIsCartOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-2xl font-black shadow-[0_4px_15px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 transition-all cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                <span>My Cart</span>
                {cartItemCount > 0 && <span className="bg-white text-blue-600 px-2 py-0.5 rounded-full text-xs ml-1">{cartItemCount}</span>}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* --- MANUAL LOCATION DRAWER --- */}
      {isChangingLocation && user?.role !== 'SELLER' && (
        <div className="bg-white/80 backdrop-blur-md border-b border-white/50 py-6 px-4 shadow-lg transition-all duration-300 relative z-30">
          <div className="max-w-2xl mx-auto flex flex-col md:flex-row gap-4 items-center">
            <form onSubmit={handleManualLocationSubmit} className="w-full flex gap-3">
              <input type="text" required placeholder="Enter exact Society, Block or Village..." value={customLocationInput} onChange={(e) => setCustomLocationInput(e.target.value)} className="w-full bg-white/90 border border-violet-200 rounded-xl px-5 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm" />
              <button type="submit" className="bg-gradient-to-r from-violet-800 to-indigo-800 text-white font-bold px-8 py-3 rounded-xl text-sm shadow-md cursor-pointer hover:shadow-lg transition-all">Set Location</button>
            </form>
            <button onClick={detectLocation} className="text-xs font-black text-violet-800 hover:text-rose-600 transition whitespace-nowrap uppercase tracking-wide cursor-pointer flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Auto-Detect
            </button>
          </div>
        </div>
      )}

      {/* --- MAIN VIEWS --- */}
      <main className="w-full relative z-10">
        {view === 'home' && user?.role !== 'SELLER' && <HomeView products={products} addToCart={addToCart} openProduct={openProduct} location={location} setIsChangingLocation={setIsChangingLocation} isLoading={isLoading} user={user} setIsAuthOpen={setIsAuthOpen} setView={setView} activeTheme={activeCategory} setActiveTheme={setActiveCategory} getImgSrc={getImgSrc} searchQuery={searchQuery} handleSearchChange={handleSearchChange} showSuggestions={showSuggestions} searchSuggestions={searchSuggestions} setShowSuggestions={setShowSuggestions} />}
        {view === 'categories' && user?.role !== 'SELLER' && <CategoriesView setView={setView} setActiveCategory={setActiveCategory} />}
        {view === 'product' && user?.role !== 'SELLER' && <ProductDetailView product={selectedProduct} addToCart={addToCart} cart={cart} removeFromCart={removeFromCart} setView={setView} />}
        {view === 'account' && user?.role !== 'SELLER' && <AccountView user={user} onLogout={handleLogout} setView={setView} />}
        {view === 'help' && user?.role !== 'SELLER' && <HelpView setView={setView} />}
        {view === 'seller' && <SellerDashboard user={user} onLogout={handleLogout} />}
      </main>

      {/* --- YAHAN ADD KIYA HAI NAYA FOOTER --- */}
      <Footer />

      {/* --- AESTHETIC FLOATING PILL BOTTOM NAVIGATION (MOBILE) --- */}
      {user?.role !== 'SELLER' && (
        <div className="md:hidden fixed bottom-6 left-5 right-5 bg-white/90 backdrop-blur-2xl border border-white/50 z-50 flex justify-around items-center py-2.5 px-2 rounded-[2rem] shadow-[0_15px_40px_rgba(0,0,0,0.12)]">
           <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-2xl transition-all ${view === 'home' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={view === 'home' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              <span className="text-[10px] font-black">Home</span>
           </button>
           
           <button onClick={() => setView('categories')} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-2xl transition-all ${view === 'categories' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              <span className="text-[10px] font-black">Categories</span>
           </button>

           {/* Floating Elevated Cart Button */}
           <button onClick={() => setIsCartOpen(true)} className="relative -mt-10 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-[0_10px_25px_rgba(37,99,235,0.4)] border-[4px] border-[#fafafa] cursor-pointer hover:scale-105 transition-transform z-10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              {cartItemCount > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#fafafa] shadow-sm">{cartItemCount}</span>}
           </button>

           <button onClick={() => setView('help')} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-2xl transition-all ${view === 'help' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={view === 'help' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              <span className="text-[10px] font-black">Support</span>
           </button>
        </div>
      )}

      {/* --- AUTH MODAL --- */}
      {isAuthOpen && (
        <div className="fixed inset-0 z-[70] flex justify-center items-center bg-black/50 backdrop-blur-sm px-4">
          <div className="absolute inset-0" onClick={() => setIsAuthOpen(false)}></div>
          <div className="relative w-full max-w-[800px] bg-white rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden animate-fade-in-up z-10 border border-gray-100">
            <button onClick={() => setIsAuthOpen(false)} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 hover:text-black transition cursor-pointer z-20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <AuthComponent onLogin={handleLoginSuccess} />
          </div>
        </div>
      )}

      {/* --- CART DRAWER --- */}
      {isCartOpen && <CartDrawer cart={cart} setCart={setCart} user={user} setIsCartOpen={setIsCartOpen} setIsAuthOpen={setIsAuthOpen} addToCart={addToCart} removeFromCart={removeFromCart} startTracking={startTracking} />}
      {/* --- ULTRA PREMIUM INDUSTRY-LEVEL SUCCESS SCREEN --- */}
      {trackingStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 transition-opacity duration-500">
          
          <div className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] transform transition-all scale-100 animate-fade-in">
             
             {/* TOP HALF: Glowing Success Graphic */}
             <div className="bg-gradient-to-br from-green-50 to-emerald-100 p-8 pb-14 flex flex-col items-center relative overflow-hidden">
                {/* Background Glowing Orbs */}
                <div className="absolute w-64 h-64 bg-green-400/30 rounded-full blur-3xl -top-10 -right-10 animate-pulse"></div>
                <div className="absolute w-64 h-64 bg-emerald-300/30 rounded-full blur-3xl -bottom-10 -left-10 animate-pulse delay-700"></div>
                
                {/* 3D Pop-Out Icon */}
                <div className="relative w-28 h-28 mt-4">
                   {/* Expanding Ripple Effect */}
                   <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-25 duration-1000"></div>
                   <div className="absolute inset-2 bg-green-400 rounded-full opacity-40"></div>
                   {/* Main Glowing Circle */}
                   <div className="absolute inset-4 bg-gradient-to-tr from-green-600 to-green-400 rounded-full shadow-[0_0_40px_rgba(34,197,94,0.6)] flex items-center justify-center z-10 border border-green-300/50">
                      <svg className="w-10 h-10 text-white drop-shadow-md animate-[bounce_2s_ease-in-out_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                   </div>
                </div>
             </div>

             {/* BOTTOM HALF: Content & Actions */}
             <div className="bg-white p-8 -mt-8 rounded-t-[2.5rem] relative z-20 flex flex-col items-center text-center shadow-[0_-10px_20px_rgba(0,0,0,0.03)]">
                
                <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Order Confirmed!</h2>
                <p className="text-slate-500 font-medium text-sm mb-6 px-4">Your delicious food is being prepared with magic and love.</p>

                {/* Micro-Interaction Status Card */}
                <div className="w-full bg-slate-50 border border-slate-100/80 rounded-3xl p-5 mb-8 shadow-sm">
                   <div className="flex justify-between items-center mb-4">
                     <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Estimated Time</span>
                     <span className="text-slate-800 font-black text-lg">20 - 25 mins</span>
                   </div>
                   
                   {/* Animated Mini Tracker */}
                   <div className="w-full mt-2 flex items-center gap-3">
                      {/* Kitchen Icon */}
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0 shadow-sm relative">
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path></svg>
                      </div>
                      
                      {/* Progress Line */}
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden relative">
                         <div className="absolute top-0 left-0 h-full bg-green-500 w-[35%] animate-pulse rounded-full"></div>
                      </div>
                      
                      {/* Destination Icon */}
                      <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                      </div>
                   </div>
                   
                   <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 uppercase px-1">
                      <span>Kitchen</span>
                      <span>Delivery</span>
                   </div>
                </div>

                {/* Premium Buttons */}
                <button 
                  onClick={() => setTrackingStatus(null)} 
                  className="w-full bg-gray-900 text-white px-6 py-4 rounded-2xl font-black text-lg hover:bg-black hover:shadow-2xl hover:shadow-gray-900/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer mb-2"
                >
                  Track Live Order
                </button>
                <button 
                  onClick={() => setTrackingStatus(null)} 
                  className="w-full text-slate-400 font-bold py-3 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  Close
                </button>
             </div>

          </div>
        </div>
      )}
      {/* 👆👆 ======================================== 👆👆 */}
    </div>
  );
}


/* =========================================
   NEW COMPONENT: PREMIUM CATEGORIES PAGE (FIXED & SLEEK)
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
      
      <div className="flex items-center gap-3 mb-6 sticky top-0 md:top-20 z-20 bg-[#fafafa]/95 backdrop-blur-xl py-4 -mx-4 px-4 md:mx-0 md:px-0 border-b border-gray-200/60 md:border-none shadow-[0_4px_20px_rgba(0,0,0,0.02)] md:shadow-none">
        <button onClick={() => setView('home')} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-200 font-bold text-xl hover:bg-gray-50 transition cursor-pointer">←</button>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Explore Categories</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {CATEGORIES_DATA.map((cat, i) => (
          <div 
            key={i} 
            onClick={() => { setActiveCategory(cat.name); setView('home'); }}
            className="relative h-44 md:h-52 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 cursor-pointer group border border-gray-200/50 bg-gray-100"
          >
            <img src={cat.img} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-90 group-hover:opacity-100" />
            
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/20 to-transparent"></div>
            
            <div className="absolute bottom-0 left-0 p-4 md:p-5 w-full flex flex-col justify-end">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-2 shadow-inner border border-white/20">
                 <span className="text-base md:text-lg drop-shadow-md">{cat.icon}</span>
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

  // FIXED FILTERING LOGIC: Direct database ki category se match karega
const filteredProducts = activeTheme === 'All' 
  ? products 
  : products.filter(p => p.category === activeTheme);

  return (
    <div className="w-full pb-10">
      
      {/* 1. DYNAMIC COLOR HEADER SECTION */}
      <div className={`w-full transition-colors duration-500 rounded-b-[2rem] md:rounded-none shadow-md ${currentTheme.bg}`}>
        
        {/* Mobile Header Elements */}
        <div className="md:hidden px-4 pt-4 pb-2 text-white">
           <div className="flex justify-between items-center mb-4">
              <div onClick={() => setIsChangingLocation(true)} className="cursor-pointer">
                 <h2 className="font-black text-[28px] tracking-tight leading-none mb-1 drop-shadow-sm">15 mins</h2>
                 <p className="text-xs font-bold opacity-90 truncate max-w-[250px] flex items-center gap-1 drop-shadow-sm">
                   To {location} <span className="text-[10px]">▼</span>
                 </p>
              </div>
              <div onClick={() => !user ? setIsAuthOpen(true) : setView('account')} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-xl shadow-inner border border-white/30 cursor-pointer hover:bg-white/30 transition">
                 {user ? <span className="text-sm font-black text-white uppercase">{user.name.charAt(0)}</span> : '👤'}
              </div>
           </div>
           
           {/* MOBILE SMART SEARCH BAR */}
           <div className="relative z-50">
             <div className="bg-white rounded-2xl px-4 py-3.5 flex items-center shadow-md border focus-within:border-blue-400 transition-all">
                <span className="text-gray-400 text-lg">🔍</span>
                <input type="text" placeholder="Search for 'Protein Atta'" value={searchQuery} onChange={handleSearchChange} onFocus={() => searchQuery && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className="w-full bg-transparent ml-2 outline-none text-sm text-gray-900 font-bold placeholder-gray-400" />
             </div>
             
             {/* MOBILE LIVE SUGGESTIONS */}
             {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-2">
                   {searchSuggestions.map(item => (
                      <div key={item._id} onClick={() => { openProduct(item); setSearchQuery(''); setShowSuggestions(false); }} className="px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 border-gray-100 cursor-pointer flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <img src={getImgSrc(item.imagePath)} className="w-8 h-8 object-contain mix-blend-multiply" alt=""/>
                            <p className="text-xs font-black text-gray-800">{item.title}</p>
                         </div>
                         <span className="text-xs font-black text-blue-600">₹{item.price}</span>
                      </div>
                   ))}
                </div>
             )}
           </div>
        </div>

        <div className="max-w-[1400px] mx-auto">
           {/* CATEGORY NAV */}
           <div className="flex overflow-x-auto hide-scroll gap-6 md:gap-8 px-4 md:px-8 pt-3 md:pt-6 border-b border-white/20">
              {Object.values(THEMES).map((tab) => (
                 <div key={tab.label} onClick={() => setActiveTheme(tab.label)} className="flex flex-col items-center cursor-pointer min-w-max relative pb-3 group">
                    <span className={`text-2xl mb-1 transition-transform duration-300 ${activeTheme === tab.label ? 'scale-125 drop-shadow-md' : 'opacity-80 group-hover:opacity-100 group-hover:scale-110'}`}>
                      {tab.icon}
                    </span>
                    <span className={`text-[11px] md:text-sm font-black transition-all mt-1 ${activeTheme === tab.label ? 'text-white drop-shadow-sm' : 'text-white/70 group-hover:text-white'}`}>
                      {tab.label}
                    </span>
                    {activeTheme === tab.label && (
                       <div className="absolute bottom-0 w-full h-1 bg-white rounded-t-md shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
                    )}
                 </div>
              ))}
           </div>

           <div className="px-4 md:px-8 py-5 md:py-8 flex justify-between items-center relative overflow-hidden">
              <div className="absolute right-[-20px] top-[-10px] opacity-10 text-[120px] transform rotate-12 pointer-events-none">⚡</div>
              <h2 className="text-[32px] md:text-5xl font-black italic transform -skew-x-[15deg] text-yellow-300 drop-shadow-[0_4px_4px_rgba(0,0,0,0.3)] leading-none ml-2">
                 ⭐ ZIPPY <br className="md:hidden"/> <span className="text-white">SUPER SALE</span> <span className="text-2xl md:text-4xl">🔥</span>
              </h2>
           </div>

           {/* UNIFORM EDGE-TO-EDGE BANNERS */}
           <div className="w-full pb-6 md:pb-10">
              <div className="flex overflow-x-auto snap-x hide-scroll gap-4 px-4 md:px-8">
                 
                 <div className="min-w-[280px] md:min-w-[340px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.15)] cursor-pointer group overflow-hidden h-[150px] md:h-[180px] hover:-translate-y-1 transition-all border border-white/20 bg-gray-900">
                    <img src="https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 z-0 opacity-80" alt="Snacks"/>
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-6 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-xl md:text-2xl leading-tight mb-1 drop-shadow-md">Midnight Munchies</h3>
                      <p className="text-rose-400 font-bold text-xs md:text-sm tracking-wide">DELIVERED TILL 3 AM</p>
                    </div>
                 </div>

                 <div className="min-w-[280px] md:min-w-[340px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.15)] cursor-pointer group overflow-hidden h-[150px] md:h-[180px] hover:-translate-y-1 transition-all border border-white/20 bg-green-900">
                    <img src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 z-0 opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-r from-green-900 via-green-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-6 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-xl md:text-2xl leading-tight mb-1 drop-shadow-md">Organic Greens</h3>
                      <p className="text-green-300 font-bold text-xs md:text-sm tracking-wide">DIRECT FROM FARMS</p>
                    </div>
                 </div>

                 <div className="min-w-[280px] md:min-w-[340px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.15)] cursor-pointer group overflow-hidden h-[150px] md:h-[180px] hover:-translate-y-1 transition-all border border-white/20 bg-red-900">
                    <img src="https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 z-0 opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-r from-red-900 via-red-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-6 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-xl md:text-2xl leading-tight mb-1 drop-shadow-md">Protein Power</h3>
                      <p className="text-red-300 font-bold text-xs md:text-sm tracking-wide">FRESH CHICKEN & EGGS</p>
                    </div>
                 </div>

                 <div className="min-w-[280px] md:min-w-[340px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.15)] cursor-pointer group overflow-hidden h-[150px] md:h-[180px] hover:-translate-y-1 transition-all border border-white/20 bg-blue-900">
                    <img src="https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 z-0 opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-900 via-blue-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-6 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-xl md:text-2xl leading-tight mb-1 drop-shadow-md">Party Essentials</h3>
                      <p className="text-cyan-300 font-bold text-xs md:text-sm tracking-wide">ICE & MIXERS</p>
                    </div>
                 </div>

                 <div className="min-w-[280px] md:min-w-[340px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.15)] cursor-pointer group overflow-hidden h-[150px] md:h-[180px] hover:-translate-y-1 transition-all border border-white/20 bg-fuchsia-900">
                    <img src="https://images.unsplash.com/photo-1621607512214-68297480165e?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 z-0 opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-900 via-fuchsia-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-6 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-xl md:text-2xl leading-tight mb-1 drop-shadow-md">Grooming Kit</h3>
                      <p className="text-fuchsia-300 font-bold text-xs md:text-sm tracking-wide">MENS & WOMENS</p>
                    </div>
                 </div>

                 <div className="min-w-[280px] md:min-w-[340px] rounded-[1.5rem] md:rounded-[2rem] snap-center relative shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.15)] cursor-pointer group overflow-hidden h-[150px] md:h-[180px] hover:-translate-y-1 transition-all border border-white/20 bg-amber-900">
                    <img src="https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=600&q=80" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 z-0 opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-900 via-amber-900/80 to-transparent z-10"></div>
                    <div className="relative z-20 p-5 md:p-6 flex flex-col justify-center h-full w-[85%]">
                      <h3 className="text-white font-black text-xl md:text-2xl leading-tight mb-1 drop-shadow-md">Pet Supplies</h3>
                      <p className="text-amber-300 font-bold text-xs md:text-sm tracking-wide">FOOD & TOYS</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>


      {/* 2. MAIN PRODUCT GRID */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-fade-in-up">
        <div className="flex items-center gap-2 mb-6 border-b border-gray-200 pb-4">
           <span className="text-2xl">🔥</span>
           <h2 className={`text-xl md:text-2xl font-black uppercase tracking-wide ${activeTheme === 'All' ? 'text-blue-600' : 'text-gray-900'}`}>
              {activeTheme === 'All' ? 'Lowest Prices Only For You' : `${activeTheme} Highlights`}
           </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-5">
          {isLoading ? (
            [1, 2, 3, 4, 5, 6].map((skel) => (
              <div key={skel} className="bg-white rounded-[1.5rem] p-3 border border-gray-100 shadow-sm flex flex-col h-full">
                 <div className="h-28 w-full mb-3 rounded-xl shimmer"></div>
                 <div className="h-3 w-3/4 rounded shimmer mb-2"></div>
                 <div className="h-2 w-1/2 rounded shimmer mb-5"></div>
                 <div className="mt-auto flex justify-between items-center pt-2">
                    <div className="h-5 w-10 rounded shimmer"></div>
                    <div className="h-8 w-8 rounded-full shimmer"></div>
                 </div>
              </div>
            ))
          ) : (
            <>
              {filteredProducts.map(p => (
                <div key={p.id} onClick={() => openProduct(p)} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(11,92,255,0.15)] hover:border-blue-200 transition-all duration-300 cursor-pointer group flex flex-col h-full relative">
                  
                  <div className="absolute top-0 left-0 bg-[#0b5cff] text-white text-[9px] font-black px-2 py-1 rounded-br-lg rounded-tl-2xl shadow-sm z-10 uppercase tracking-widest">Bestseller</div>
                  
                  <div className="h-28 md:h-32 w-full mb-3 rounded-xl overflow-hidden flex items-center justify-center p-2 relative bg-gray-50/50 mt-2">
                     <img src={`${API_URL.replace('/api', '')}/uploads/${p.imagePath}`} alt={p.title} className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform duration-500 mix-blend-multiply drop-shadow-sm" onError={(e) => e.target.src='https://via.placeholder.com/150'} />
                  </div>
                  
                  <div className="flex flex-col flex-1 justify-between">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] text-green-600 font-black">★ 4.5</span>
                        <span className="text-[9px] text-gray-400 font-bold">12 Mins</span>
                      </div>
                      <h4 className="text-xs md:text-sm font-bold text-gray-800 line-clamp-2 leading-snug">{p.title}</h4>
                      <span className="inline-block mt-1.5 border border-blue-100 text-blue-600 bg-blue-50 text-[9px] font-black px-1.5 py-0.5 rounded">1 Pack</span>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex items-end justify-between relative">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-red-500 font-black uppercase mb-0.5">Price Drop</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm md:text-base font-black text-gray-900">₹{(p.price)}</span>
                          <span className="text-[10px] text-gray-400 line-through font-bold">₹{(p.price * 1.15).toFixed(0)}</span>
                        </div>
                      </div>
                      
                      <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} className="absolute -right-1 -bottom-1 w-9 h-9 md:w-10 md:h-10 bg-white border-2 border-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-xl font-light hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors shadow-sm cursor-pointer pb-0.5">
                         +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center bg-gray-50 rounded-[2rem] border border-dashed border-gray-300">
                   <span className="text-5xl opacity-40">🛒</span>
                   <h3 className="text-xl font-black text-gray-800 mt-4">No items found</h3>
                   <p className="text-gray-500 font-bold mt-1 text-sm">We are restocking soon!</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3. ZIPPY CAFE SECTION */}
      <div className="w-full bg-[#111827] py-10 md:py-16 my-8 text-white relative overflow-hidden">
         <div className="max-w-[1400px] mx-auto px-4 md:px-8">
            <div className="flex justify-between items-end mb-6 md:mb-8">
               <div>
                 <span className="bg-rose-500 text-white text-[10px] font-black tracking-widest px-2 py-1 rounded mb-2 inline-block uppercase shadow-sm">Freshly Brewed</span>
                 <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight">Zippy Cafe <span className="text-[#f59e0b]">☕</span></h2>
               </div>
            </div>
         </div>
            
         <div className="w-full">
            <div className="flex overflow-x-auto snap-x hide-scroll gap-4 px-4 md:px-8 pb-4">
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
                  <div key={i} className="min-w-[150px] md:min-w-[180px] bg-[#1f2937] p-3 rounded-2xl border border-gray-700 hover:border-gray-500 transition-colors group cursor-pointer snap-center shadow-lg">
                     <div className="h-28 w-full rounded-xl mb-3 overflow-hidden relative">
                       <img src={item.i} alt={item.n} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                     </div>
                     <h4 className="text-sm font-bold text-white truncate">{item.n}</h4>
                     <div className="flex justify-between items-center mt-3">
                        <span className="font-black text-base text-white">₹{item.p}</span>
                        <button 
  onClick={() => addToCart({ id: item.id, title: item.n, price: item.p, imagePath: item.i, category: 'Cafe' })} 
  className="bg-white text-gray-900 text-[10px] font-black px-3 py-1.5 rounded-lg transition cursor-pointer hover:bg-blue-600 hover:text-white shadow-sm"
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
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => setView('home')} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-200 font-bold text-xl hover:bg-gray-50 transition cursor-pointer">←</button>
        <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">Zippy Support</h1>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 md:p-10 mb-6 text-center">
         <div className="w-24 h-24 bg-blue-50 rounded-full mx-auto flex items-center justify-center mb-6 border border-blue-100">
            <span className="text-5xl">🎧</span>
         </div>
         <h2 className="text-2xl font-black text-gray-900 mb-2">Need Help?</h2>
         <p className="text-gray-500 font-bold mb-8 text-sm md:text-base">We are here to resolve your issues within 10 minutes.</p>

         <div className="flex flex-col gap-4">
            <a href="mailto:satyamsingh843484@gmail.com" className="bg-blue-50 p-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-blue-100 transition border border-blue-100">
               <span className="text-xl">📧</span>
               <span className="font-black text-blue-700 text-sm md:text-base">satyamsingh843484@gmail.com</span>
            </a>
            <a href="tel:+918434849565" className="bg-green-50 p-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-green-100 transition border border-green-100">
               <span className="text-xl">📞</span>
               <span className="font-black text-green-700 text-sm md:text-base">+91 8434849565</span>
            </a>
         </div>
      </div>
    </div>
  );
}

/* =========================================
   PRODUCT DETAIL PAGE
========================================= */
function ProductDetailView({ product, addToCart, cart, removeFromCart, setView }) {
  if (!product) return null;
  const cartItem = cart.find(i => i.id === product.id);
  const qty = cartItem ? cartItem.quantity : 0;
  const inrPrice = Number(product.price).toFixed(0);
  const mrp = (product.price * 1.15).toFixed(0);

  return (
    <div className="max-w-6xl mx-auto pt-8 pb-32 md:pb-20 px-4 md:px-8 animate-fade-in-up relative z-10">
      <button onClick={() => setView('home')} className="text-sm font-bold text-gray-600 mb-8 hover:text-blue-600 flex items-center gap-2 cursor-pointer bg-white px-5 py-2.5 rounded-xl shadow-sm border border-gray-200 transition">
        <span>←</span> Back to Store
      </button>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-20">
        <div className="flex flex-col relative">
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-8 md:p-12 flex items-center justify-center h-[350px] md:h-[500px] mb-6">
            <img src={`${API_URL.replace('/api', '')}/uploads/${product.imagePath}`} alt={product.title} className="max-h-full max-w-full object-contain mix-blend-multiply hover:scale-105 transition-transform duration-500" onError={(e) => e.target.src='https://via.placeholder.com/400'} />
          </div>
          <div className="bg-white rounded-2xl flex items-center justify-between text-gray-900 border-2 border-blue-600 overflow-hidden shadow-sm">
            {(() => {
              // Cart mein check karo ki ye product hai ya nahi
              const cartItem = cart.find(item => (item._id || item.id) === (product._id || product.id));
              const currentQty = cartItem ? cartItem.quantity : 0;

              return currentQty === 0 ? (
                // 🔵 AGAR CART MEIN NAHI HAI: Show ADD TO CART
                <button onClick={() => addToCart(product)} className="w-full py-4 font-black text-base md:text-lg text-blue-600 hover:bg-blue-50 transition cursor-pointer">
                  ADD TO CART
                </button>
              ) : (
                // 🟢 AGAR CART MEIN HAI: Show + / - Selector
                <div className="w-full flex items-center justify-between px-6 md:px-8 py-2 md:py-3 bg-blue-600 text-white">
                  {/* Yahan product._id || product.id pass karna zaroori hai */}
                  <button onClick={() => removeFromCart(product._id || product.id)} className="text-3xl font-light hover:scale-125 transition cursor-pointer">−</button>
                  <span className="text-xl md:text-2xl font-black">{currentQty}</span>
                  <button onClick={() => addToCart(product)} className="text-3xl font-light hover:scale-125 transition cursor-pointer">+</button>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="space-y-6 md:space-y-8 flex flex-col justify-center">
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h1 className="text-3xl lg:text-5xl font-black text-gray-900 mb-3 md:mb-4 leading-tight tracking-tight">{product.title}</h1>
            <p className="text-gray-500 font-bold text-sm md:text-lg">1 Unit / Pack</p>
            <div className="mt-4 md:mt-6 flex items-end gap-3 md:gap-4">
              <span className="text-gray-900 font-black text-4xl md:text-5xl">₹{inrPrice}</span>
              <div className="flex flex-col pb-1.5">
                 <span className="text-xs md:text-sm text-gray-400 font-bold line-through">MRP ₹{mrp}</span>
                 <span className="text-[9px] md:text-[11px] text-gray-500 font-bold">(incl. of all taxes)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================
   CART DRAWER (FIXED SMART ID LOGIC)
========================================= */
function CartDrawer({ cart, setCart, user, setIsCartOpen, setIsAuthOpen, addToCart, removeFromCart, startTracking }) {
  const cartTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const inrTotal = (cartTotal).toFixed(2);
  const saved = (cartTotal * 0.15).toFixed(2); 

  const handleCheckout = async () => {
    if(!user) { setIsCartOpen(false); setIsAuthOpen(true); return; }
    
    // 1. Razorpay script load karo
    const res = await loadRazorpayScript();
    if (!res) { alert("Razorpay SDK failed to load. Are you online?"); return; }

    const finalAmount = parseFloat(inrTotal) + 2; // Cart total + ₹2 Delivery fee

    try {
      // 2. Backend se Order ID maango
      const orderData = await fetch(`${API_URL}/payment/create-order`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: finalAmount }) 
      }).then((t) => t.json());

      if (!orderData || !orderData.id) { alert("Server error! Cannot start payment."); return; }

      // 3. Razorpay Popup open karo
      const options = {
        key: "rzp_test_T4Zw9v5VFk4BbP", // Yahan wapas apni Test Key daalna
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Zippy Groceries",
        description: "10-Minute Delivery Order",
        image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=100", // Zippy logo
        order_id: orderData.id,
        handler: async function (response) {
          // 4. Payment Success hone par verify karo
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
            // 5. Payment successful hone ke BAAD database me order save karo
            await fetch(`${API_URL}/orders/place?customerName=${user.name}&totalAmount=${finalAmount}`, { method: 'POST' });

            // 👇 Alert hata diya aur naya Live Tracking laga diya 👇
            setCart([]); 
            setIsCartOpen(false);
            startTracking(response.razorpay_payment_id); 
            // 👆 ========================================== 👆
            
          } else {
            alert("Payment Verification Failed!");
          }
        },
        prefill: {
          name: user.name,
          email: user.email,
          contact: "9999999999"
        },
        theme: { color: "#2563eb" } // Blue theme Zippy ke hisaab se
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();

    } catch (error) { 
      console.error(error); 
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40 backdrop-blur-sm transition-opacity">
      <div className="absolute inset-0" onClick={() => setIsCartOpen(false)}></div>
      
      <div className="w-full max-w-[420px] bg-[#fafafa] h-full shadow-2xl flex flex-col animate-fade-in-up relative z-10 border-l border-gray-200">
        <div className="bg-white px-5 py-4 flex items-center border-b border-gray-200 shadow-sm sticky top-0 z-20">
          <button onClick={() => setIsCartOpen(false)} className="text-gray-900 font-bold text-2xl mr-4 hover:bg-gray-100 w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer">×</button>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">My Cart</h2>
        </div>

        <div className="flex-1 overflow-y-auto pb-32 hide-scroll">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100">
                <span className="text-6xl drop-shadow-md">🛒</span>
              </div>
              <p className="font-black text-xl text-gray-600 tracking-tight">Your cart is empty</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="bg-green-50 text-green-700 text-xs font-black text-center py-3 rounded-xl border border-green-200 shadow-sm">🎉 Yay! You saved ₹{saved} on this order</div>
              
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {cart.map((item, index) => (
                  // KEY ERROR FIXED HERE 👇
                  <div key={item._id || item.id || index} className={`p-4 flex gap-3 items-center ${index !== cart.length -1 ? 'border-b border-gray-100' : ''}`}>
                    <div className={`w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-200 ${item.category === 'Cafe' ? 'p-0 overflow-hidden' : 'p-2'}`}>
                       <img 
                         src={getImgSrc(item.imagePath)} 
                         className={`w-full h-full ${item.category === 'Cafe' ? 'object-cover' : 'object-contain mix-blend-multiply'}`} 
                         alt={item.title} 
                       />
                    </div>
                    <div className="flex-1">
                      <h5 className="text-xs md:text-sm font-black text-gray-800 line-clamp-1">{item.title}</h5>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-gray-400 line-through font-bold">₹{(item.price*1.15).toFixed(0)}</span>
                        <span className="text-sm font-black text-gray-900">₹{item.price}</span>
                      </div>
                    </div>
                    <div className="flex items-center border-2 border-blue-600 rounded-xl bg-white text-blue-600 font-black h-9 overflow-hidden shadow-sm">
                      {/* INLINE LOGIC REMOVED, SMART FUNCTIONS ADDED HERE 👇 */}
                      <button onClick={() => removeFromCart(item._id || item.id || item.title)} className="px-3 hover:bg-blue-600 hover:text-white transition h-full cursor-pointer">−</button>
                      <span className="px-2 text-xs">{item.quantity}</span>
                      <button onClick={() => addToCart(item)} className="px-3 hover:bg-blue-600 hover:text-white transition h-full cursor-pointer">+</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h4 className="font-black text-sm text-gray-900 mb-4 flex items-center gap-2">📄 Bill Summary</h4>
                <div className="space-y-3 text-xs md:text-sm font-bold text-gray-500">
                  <div className="flex justify-between"><span>Item Total</span><span className="text-gray-800">₹{inrTotal}</span></div>
                  <div className="flex justify-between border-b border-gray-200 pb-3"><span>Delivery Fee</span><span className="text-green-600 font-black">FREE</span></div>
                  <div className="flex justify-between text-base font-black text-gray-900 pt-1"><span>To Pay</span><span>₹{(parseFloat(inrTotal) + 2).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="absolute bottom-0 w-full bg-white p-4 md:p-5 border-t border-gray-200 shadow-[0_-15px_30px_rgba(0,0,0,0.05)] pb-8 md:pb-5 z-30">
            <button onClick={handleCheckout} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-600/30 hover:bg-blue-700 hover:-translate-y-1 transition-all flex justify-between px-6 md:px-8 text-sm md:text-lg cursor-pointer">
               <span>{user ? 'Proceed to Pay' : 'Login to Proceed'}</span>
               <span>₹{(parseFloat(inrTotal) + 2).toFixed(2)} <span className="ml-1 md:ml-2 font-normal">→</span></span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================
   AUTH MODAL COMPONENT
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
      <div className="hidden md:flex flex-col w-2/5 bg-blue-600 p-10 text-white justify-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80')] opacity-20 bg-cover bg-center mix-blend-overlay"></div>
        <div className="relative z-10">
           <h1 className="text-5xl font-black tracking-tighter mb-4 drop-shadow-md">zippy</h1>
           <h2 className="text-3xl font-black leading-tight mb-2 drop-shadow-md">Groceries in<br/><span className="text-yellow-300">10 Minutes</span></h2>
        </div>
      </div>
      
      <div className="w-full md:w-3/5 p-6 md:p-12 flex flex-col justify-center bg-white relative">
        {step === 1 ? (
          <div className="w-full">
            <div className="text-center mb-6 md:mb-8">
               <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Get Started</h3>
               <p className="text-xs md:text-sm text-gray-500 font-bold mt-1 md:mt-2">Enter your phone number to login</p>
            </div>
            <form onSubmit={sendOtp} className="space-y-4 md:space-y-5 w-full">
              <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden focus-within:border-blue-500 transition-all shadow-sm">
                <div className="bg-gray-50 px-3 md:px-4 py-3.5 md:py-4 border-r border-gray-200 font-black text-gray-700 whitespace-nowrap">🇮🇳 +91</div>
                <input type="tel" maxLength="10" required placeholder="Mobile Number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className="w-full bg-transparent px-3 md:px-4 py-3.5 md:py-4 text-base md:text-lg font-black text-gray-900 focus:outline-none tracking-widest" />
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <input type="text" placeholder="Your Name" value={name} onChange={(e)=>setName(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 md:py-3.5 text-sm font-bold focus:outline-none focus:border-blue-500 transition shadow-sm" />
                <select value={role} onChange={(e)=>setRole(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 md:py-3.5 text-sm font-bold focus:outline-none focus:border-blue-500 transition cursor-pointer shadow-sm">
                  <option value="CUSTOMER">Customer</option><option value="SELLER">Partner</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white font-black py-3.5 md:py-4 rounded-xl shadow-lg shadow-blue-600/30 hover:-translate-y-1 hover:bg-blue-700 transition-all cursor-pointer mt-2 text-base md:text-lg">Continue</button>
            </form>
          </div>
        ) : (
          <div className="w-full">
            <button onClick={() => setStep(1)} className="text-blue-600 font-bold text-xs md:text-sm mb-4 md:mb-6 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition cursor-pointer">← Change Number</button>
            <div className="mb-6 md:mb-8">
               <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Verify OTP</h3>
               <p className="text-xs md:text-sm text-gray-500 font-bold mt-1 md:mt-2">Code sent to +91 {phone}</p>
            </div>
            <form onSubmit={verifyOtpAndLogin} className="space-y-4 md:space-y-6 w-full">
              <input type="text" maxLength="4" required placeholder="Enter 4-digit code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-4 md:py-5 text-center text-xl md:text-3xl font-black tracking-[0.5em] focus:outline-none focus:border-blue-500 transition shadow-inner" />
              <button type="submit" className="w-full bg-blue-600 text-white font-black py-3.5 md:py-4 rounded-xl shadow-lg shadow-blue-600/30 hover:-translate-y-1 hover:bg-blue-700 transition-all cursor-pointer text-base md:text-lg">Verify & Login</button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

/* =========================================
   OP LEVEL SELLER DASHBOARD (ULTRA PREMIUM)
========================================= */
function SellerDashboard({ user, onLogout }) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [newProduct, setNewProduct] = useState({ title: '', price: '', category: 'Fresh', file: null });

  const loadData = () => {
    fetch(`${API_URL}/products/all`).then(res => res.json()).then(data => setProducts(data.filter(p => p.sellerId === user.id)));
    fetch(`${API_URL}/orders/all`).then(res => res.json()).then(data => setOrders(data.reverse()));
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

  const activeOrders = orders.filter(o => o.status !== 'DELIVERED').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 pb-24 md:pb-20 relative z-10 selection:bg-indigo-200">
      
      {/* BACKGROUND AESTHETICS */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-400/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-[1400px] mx-auto py-6 md:py-10 px-4 w-full space-y-8 animate-fade-in-up relative z-20">
        
        {/* 1. GLASSMORPHISM HEADER */}
        <div className="bg-white/70 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
               <span className="text-2xl text-white">⚡</span>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Partner Central</h1>
              <p className="text-gray-500 font-bold text-sm">Welcome back, {user.name}!</p>
            </div>
          </div>
          <button onClick={onLogout} className="bg-white border-2 border-rose-100 text-rose-600 px-6 py-2.5 rounded-xl font-black hover:bg-rose-600 hover:text-white hover:border-rose-600 hover:shadow-lg hover:shadow-rose-500/30 transition-all cursor-pointer text-sm w-full md:w-auto">
            Secure Logout
          </button>
        </div>

        {/* 2. COLORFUL OP STATS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
           <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-[2rem] p-6 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden transform hover:-translate-y-1 transition-transform">
              <div className="absolute -right-6 -top-6 text-white/20 text-8xl">📦</div>
              <h4 className="text-blue-100 font-bold text-sm uppercase tracking-wider mb-2">Total Orders</h4>
              <span className="text-4xl font-black drop-shadow-md">{orders.length}</span>
           </div>
           
           <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-[2rem] p-6 text-white shadow-lg shadow-purple-500/20 relative overflow-hidden transform hover:-translate-y-1 transition-transform">
              <div className="absolute -right-6 -top-6 text-white/20 text-8xl">🔥</div>
              <h4 className="text-purple-100 font-bold text-sm uppercase tracking-wider mb-2">Active Action Req.</h4>
              <span className="text-4xl font-black drop-shadow-md">{activeOrders}</span>
           </div>

           <div className="bg-gradient-to-r from-orange-400 to-rose-500 rounded-[2rem] p-6 text-white shadow-lg shadow-orange-500/20 relative overflow-hidden transform hover:-translate-y-1 transition-transform">
              <div className="absolute -right-6 -top-6 text-white/20 text-8xl">🛒</div>
              <h4 className="text-orange-100 font-bold text-sm uppercase tracking-wider mb-2">Your Live Items</h4>
              <span className="text-4xl font-black drop-shadow-md">{products.length}</span>
           </div>
        </div>
        
        {/* 3. PREMIUM RESTOCK INVENTORY FORM (Perfect Alignment Retained) */}
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-r from-gray-900 to-indigo-900 px-6 md:px-8 py-5 flex items-center justify-between">
             <h3 className="font-black text-white text-lg md:text-xl flex items-center gap-2">
               <span className="bg-white/20 p-1.5 rounded-lg">➕</span> Restock Inventory
             </h3>
          </div>
          <div className="p-6 md:p-8">
            <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-4 md:gap-5 md:items-end">
              <div className="flex-1">
                <label className="block text-[10px] md:text-xs font-black text-gray-400 mb-1.5 uppercase tracking-wider">Item Name</label>
                <input type="text" required value={newProduct.title} onChange={(e) => setNewProduct({...newProduct, title: e.target.value})} className="h-[50px] bg-gray-50 border border-gray-200 px-4 rounded-xl w-full font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:bg-white focus:outline-none transition-all text-sm box-border" placeholder="e.g. Fresh Apples" />
              </div>
              
              <div className="flex-1">
                <label className="block text-[10px] md:text-xs font-black text-gray-400 mb-1.5 uppercase tracking-wider">Category</label>
                <select value={newProduct.category} onChange={(e) => setNewProduct({...newProduct, category: e.target.value})} className="h-[50px] bg-gray-50 border border-gray-200 px-4 rounded-xl w-full font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:bg-white focus:outline-none transition-all text-sm cursor-pointer box-border text-gray-700">
                  <option value="Fresh">Fresh</option><option value="Grocery">Grocery</option><option value="Electronics">Electronics</option><option value="Fashion">Fashion</option><option value="Beauty">Beauty</option><option value="Home">Home</option><option value="Kids">Kids</option><option value="50% Off">50% Off</option><option value="School Time">School Time</option><option value="Father's Day">Father's Day</option>
                </select>
              </div>

              <div className="w-full md:w-32">
                <label className="block text-[10px] md:text-xs font-black text-gray-400 mb-1.5 uppercase tracking-wider">Price (₹)</label>
                <input type="number" required value={newProduct.price} onChange={(e) => setNewProduct({...newProduct, price: e.target.value})} className="h-[50px] bg-gray-50 border border-gray-200 px-4 rounded-xl w-full font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:bg-white focus:outline-none transition-all text-sm box-border" placeholder="0.00" />
              </div>

              <div className="flex-1">
                <label className="block text-[10px] md:text-xs font-black text-gray-400 mb-1.5 uppercase tracking-wider">Image File</label>
                <div className="h-[50px] bg-gray-50 border border-gray-200 rounded-xl w-full flex items-center px-3 box-border focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:bg-white transition-all overflow-hidden">
                  <input type="file" required onChange={(e) => setNewProduct({...newProduct, file: e.target.files[0]})} className="w-full text-[11px] md:text-xs font-bold file:mr-3 file:bg-indigo-100 file:text-indigo-700 file:border-0 file:px-3 file:py-1.5 file:rounded-lg cursor-pointer hover:file:bg-indigo-200 transition-colors" />
                </div>
              </div>

              <button type="submit" className="h-[50px] bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 md:px-10 rounded-xl font-black hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all cursor-pointer text-sm w-full md:w-auto mt-2 md:mt-0 whitespace-nowrap box-border">
                Publish Item
              </button>
            </form>
          </div>
        </div>

        {/* 4. MODERN INCOMING ORDERS FEED */}
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden border border-gray-100">
          <div className="bg-white px-6 md:px-8 py-5 border-b border-gray-100 flex justify-between items-center sticky top-0 z-10">
             <h3 className="font-black text-gray-900 text-lg md:text-xl flex items-center gap-2">
               Live Orders Feed <span className="relative flex h-3 w-3 ml-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>
             </h3>
          </div>
          <div className="p-4 md:p-6 grid gap-4 max-h-[600px] overflow-y-auto hide-scroll bg-gray-50/50">
            {orders.map(o => (
              <div key={o._id} className={`flex flex-col md:flex-row justify-between md:items-center bg-white p-5 md:p-6 rounded-[1.5rem] border ${o.status === 'DELIVERED' ? 'border-gray-200 opacity-60 grayscale-[30%]' : 'border-indigo-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(79,70,229,0.1)]'} transition-all duration-300 gap-4`}>
                
                <div className="flex items-start gap-4">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shadow-inner ${o.status === 'DELIVERED' ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600'}`}>
                     {o.customerName.charAt(0)}
                   </div>
                   <div>
                     <div className="flex items-center gap-2">
                       <h4 className="font-black text-lg md:text-xl text-gray-900 leading-tight">{o.customerName}</h4>
                       <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">#{o._id ? o._id.substring(o._id.length - 6) : '---'}</span>
                     </div>
                     <p className="text-indigo-600 font-black text-base mt-1">₹{Number(o.totalAmount).toFixed(0)}</p>
                   </div>
                </div>

                <div className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4 mt-2 md:mt-0">
                   {/* DYNAMIC STATUS BADGE */}
                   <span className={`font-black tracking-wider text-[10px] md:text-xs px-4 py-2 rounded-xl border w-full md:w-auto text-center shadow-sm uppercase
                     ${o.status === 'RECEIVED' ? 'bg-rose-50 text-rose-600 border-rose-200' : 
                       o.status === 'PACKING' ? 'bg-amber-50 text-amber-600 border-amber-200' : 
                       o.status === 'DISPATCHED' ? 'bg-blue-50 text-blue-600 border-blue-200' : 
                       'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                   >
                     {o.status}
                   </span>
                   
                   {/* ACTION BUTTONS WITH COLORFUL GLOW */}
                   {o.status === 'RECEIVED' && (
                     <button onClick={() => updateOrderStatus(o._id, 'PACKING')} className="bg-amber-500 text-white px-6 py-2.5 md:py-3 rounded-xl shadow-lg shadow-amber-500/30 text-xs md:text-sm font-black hover:-translate-y-1 hover:bg-amber-600 transition-all w-full md:w-auto cursor-pointer">Start Packing</button>
                   )}
                   {o.status === 'PACKING' && (
                     <button onClick={() => updateOrderStatus(o._id, 'DISPATCHED')} className="bg-blue-500 text-white px-6 py-2.5 md:py-3 rounded-xl shadow-lg shadow-blue-500/30 text-xs md:text-sm font-black hover:-translate-y-1 hover:bg-blue-600 transition-all w-full md:w-auto cursor-pointer">Dispatch Rider</button>
                   )}
                   {o.status === 'DISPATCHED' && (
                     <button onClick={() => updateOrderStatus(o._id, 'DELIVERED')} className="bg-emerald-500 text-white px-6 py-2.5 md:py-3 rounded-xl shadow-lg shadow-emerald-500/30 text-xs md:text-sm font-black hover:-translate-y-1 hover:bg-emerald-600 transition-all w-full md:w-auto cursor-pointer">Mark Delivered</button>
                   )}
                </div>
              </div>
            ))}
            
            {orders.length === 0 && (
              <div className="text-center py-16 flex flex-col items-center">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100">
                   <span className="text-4xl opacity-50">☕</span>
                </div>
                <h3 className="text-xl font-black text-gray-800">No active orders yet</h3>
                <p className="text-gray-500 font-bold mt-1 text-sm">Grab a coffee while you wait.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

/* =========================================
   PREMIUM ACCOUNT VIEW (FIXED WITH MONGODB _ID)
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
    <div className="max-w-3xl mx-auto pt-8 pb-32 px-4 md:px-8 animate-fade-in-up relative z-10">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => setView('home')} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-200 font-bold text-xl hover:bg-gray-50 transition cursor-pointer">←</button>
        <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">My Account</h1>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 md:p-10 mb-6">
        <div className="flex items-center gap-5 md:gap-6 mb-8 border-b border-gray-100 pb-8">
          <div className="w-20 h-20 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-3xl font-black uppercase border border-blue-200">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{user.name}</h2>
            <p className="text-gray-500 font-bold mt-1">{user.email}</p>
            <span className="inline-block mt-2 bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded uppercase tracking-wider">Verified Customer</span>
          </div>
        </div>

        <h3 className="font-black text-xl text-gray-900 mb-4 tracking-tight">My Orders</h3>
        <div className="space-y-4 mb-8">
          {myOrders.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-gray-500 font-bold text-sm">
               No orders placed yet. Time to grab some snacks! 🍿
            </div>
          ) : (
            myOrders.map(o => (
              <div key={o._id} className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-bold text-gray-500">Order #{o._id ? o._id.substring(o._id.length - 6) : '---'}</span>
                    <h4 className="font-black text-lg text-gray-900 mt-1">₹{Number(o.totalAmount).toFixed(0)}</h4>
                  </div>
                  <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${o.status === 'DELIVERED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {o.status}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[10px] md:text-xs font-bold text-gray-400 mb-2">
                    <span className={getProgress(o.status) >= 25 ? 'text-gray-900' : ''}>Placed</span>
                    <span className={getProgress(o.status) >= 50 ? 'text-blue-600' : ''}>Packing</span>
                    <span className={getProgress(o.status) >= 75 ? 'text-blue-600' : ''}>Dispatched</span>
                    <span className={getProgress(o.status) === 100 ? 'text-green-600' : ''}>Delivered</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${o.status === 'DELIVERED' ? 'bg-green-500' : 'bg-blue-500'}`} 
                      style={{ width: `${getProgress(o.status)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <button onClick={onLogout} className="w-full bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-600 hover:text-white transition-all font-black py-4 rounded-2xl text-lg shadow-sm cursor-pointer">
        Logout from Zippy
      </button>
    </div>
  );
}

/* =========================================
   FOOTER COMPONENT (Instamart Exact Match)
========================================= */
function Footer() {
  return (
    <footer className="w-full bg-[#f4f6fb] pt-12 pb-36 md:pb-16 mt-4 border-t border-gray-100">
      {/* Container: Changed to strictly left-aligned on all screens (items-start text-left) */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 flex flex-col items-start text-left">
        
        {/* Zippy Logo in Flat Gray */}
        <h1 className="text-[48px] md:text-[64px] font-black tracking-[-0.06em] text-[#b0b3b8] leading-none mb-1 lowercase" style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
          zippy
        </h1>
        
        {/* Crafted with Pure Vector Heart - Font size reduced to match image */}
        <p className="text-[14px] md:text-[16px] font-medium text-[#7a8089] flex items-center justify-start tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
          Crafted with 
          
          {/* Vector Icon size reduced slightly to match smaller text */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px] md:w-[17px] md:h-[17px] mx-1 text-[#005af0]">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          
          in Patna, India
        </p>
        
      </div>
    </footer>
  );
}