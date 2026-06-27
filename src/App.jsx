import React, { useState, useEffect, } from 'react';
import { io } from 'socket.io-client';
const HOST = window.location.hostname;
const API_URL = `https://zippy-backend-vc4w.onrender.com/api`;
const socket = io(`https://zippy-backend-vc4w.onrender.com`); // <--- YAHAN ADD HOGA SOCKET CONNECTION
// 👇👇 BAS YE 4 LINES YAHAN PASTE KAR DO 👇👇
const getImgSrc = (path) => {
  if (!path) return 'https://via.placeholder.com/150';
  return path.startsWith('http') ? path : `https://zippy-backend-vc4w.onrender.com/uploads/${path}`;
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
    if (!savedUser) return 'home';
    
    const parsedUser = JSON.parse(savedUser);
    if (parsedUser.role === 'SELLER') return 'seller';
    if (parsedUser.role === 'PENDING_SELLER') return 'pending';
    if (parsedUser.role === 'ADMIN') return 'admin'; // 🔥 Naya rule add kiya
    return 'home';
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
    
    // 🔥 Yahan hum check kar rahe hain ki user kya hai
    if (userData.role === 'SELLER') { setView('seller'); setCart([]); } 
    else if (userData.role === 'PENDING_SELLER') { setView('pending'); setCart([]); }
    else if (userData.role === 'ADMIN') { setView('admin'); setCart([]); } 
    else { setView('home'); }
  };

  const handleLogout = () => {
    setUser(null); localStorage.removeItem('zippy_user'); setCart([]); setView('home');
  };
  // ==========================================
  // EDIT AND DELETE LOGIC
  // ==========================================
  
  // State to track which product is currently being edited
  const [editingProduct, setEditingProduct] = useState(null);

  // Function to handle deleting a product
  const handleDelete = async (productId) => {
    const isConfirmed = window.confirm("Are you sure you want to delete this product?");
    if (!isConfirmed) return;

    try {
      // Calling the backend API to delete the product
      const response = await fetch(`https://zippy-backend-vc4w.onrender.com/api/products/delete/${productId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        alert("Product deleted successfully!");
        window.location.reload(); // Refresh the page to update the product list
      } else {
        alert("Failed to delete product.");
      }
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  };

  // Function to trigger the edit popup form
  const handleEditClick = (product) => {
    setEditingProduct(product); 
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
      {/* ========================================== */}
      {editingProduct && (
        <EditProductModal 
          product={editingProduct} 
          onClose={() => setEditingProduct(null)} 
        />
      )}
      {/* ========================================== */}
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

        /* 💥 NAYA PREMIUM UI & GAMIFICATION CSS 💥 */
        .sunlit-glow {
          background: radial-gradient(circle at top left, rgba(255, 245, 200, 0.6) 0%, rgba(255, 255, 255, 0) 60%);
        }
        
        .studio-shadow {
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.06), inset 0 2px 10px rgba(255,255,255,0.7);
        }
        
        .scratch-card-pattern {
          background-image: repeating-linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 75%, #cbd5e1 75%, #cbd5e1), repeating-linear-gradient(45deg, #cbd5e1 25%, #e2e8f0 25%, #e2e8f0 75%, #cbd5e1 75%, #cbd5e1);
          background-position: 0 0, 10px 10px;
          background-size: 20px 20px;
        }
        
        .animate-pop-in {
          animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        
        @keyframes popIn {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

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
            <div className="flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform" onClick={() => { if((!user || user.role === 'CUSTOMER')) { setActiveCategory('All'); setView('home'); setSelectedProduct(null); } }}>
              <span className="text-4xl font-black tracking-tighter text-blue-600">zippy</span>
            </div>
            
            {/* 🔥 LEAK FIXED: Only Customers see Location */}
            {(!user || user.role === 'CUSTOMER') && (
              <div className="flex flex-col border-l border-gray-200 pl-6 cursor-pointer group" onClick={() => setIsChangingLocation(!isChangingLocation)}>
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider group-hover:text-blue-600 transition flex items-center gap-1">
                  Delivery Location <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </span>
                <span className="text-[15px] font-bold text-gray-800 truncate w-56">{location}</span>
              </div>
            )}
          </div>

          {/* 🔥 LEAK FIXED: Only Customers see Search Bar */}
          {(!user || user.role === 'CUSTOMER') && (
            <div className="flex-1 max-w-2xl mx-8 relative z-50">
               <div className="w-full flex items-center bg-gray-100/80 rounded-2xl px-5 py-3 border border-transparent focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-[0_4px_20px_rgba(37,99,235,0.1)] transition-all">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                 <input type="text" placeholder="Search for 'Apple', 'Milk'..." value={searchQuery} onChange={handleSearchChange} onFocus={() => searchQuery && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className="w-full bg-transparent focus:outline-none ml-3 text-sm font-bold text-gray-800" />
               </div>
               
               {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-2 animate-fade-in-up">
                     {searchSuggestions.map(item => (
                        <div key={item._id} onClick={() => { openProduct(item); setSearchQuery(''); setShowSuggestions(false); }} className="px-5 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group transition-colors">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center p-1 border border-gray-100">
  <img src={item.imagePath?.startsWith('http') ? item.imagePath : getImgSrc(item.imagePath)} className="w-8 h-8 object-contain mix-blend-multiply" alt="" onError={(e) => e.target.src='https://via.placeholder.com/50'} />
</div>
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
              // 🔥 LEAK FIXED: Smart Profile Click Routing
              <div className="flex flex-col items-end cursor-pointer group" onClick={() => {
                if (user.role === 'ADMIN') setView('admin');
                else if (user.role === 'PENDING_SELLER') setView('pending');
                else if (user.role === 'SELLER') setView('seller');
                else setView('account');
              }} title="Go to Dashboard">
                <span className="text-xs font-bold text-gray-500">Welcome,</span>
                <span className="text-sm font-black text-blue-600 group-hover:text-blue-800 transition flex items-center gap-1">{user.name}</span>
              </div>
            )}

            {/* 🔥 LEAK FIXED: Only Customers see Cart Button */}
            {(!user || user.role === 'CUSTOMER') && (
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
      {isChangingLocation && (!user || user.role === 'CUSTOMER') && (
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
        {/* 🔥 LEAK FIXED: Main View Routing Strict Protection */}
        {view === 'home' && (!user || user.role === 'CUSTOMER') && <HomeView products={products} addToCart={addToCart} openProduct={openProduct} location={location} setIsChangingLocation={setIsChangingLocation} isLoading={isLoading} user={user} setIsAuthOpen={setIsAuthOpen} setView={setView} activeTheme={activeCategory} setActiveTheme={setActiveCategory} getImgSrc={getImgSrc} searchQuery={searchQuery} handleSearchChange={handleSearchChange} showSuggestions={showSuggestions} searchSuggestions={searchSuggestions} setShowSuggestions={setShowSuggestions} />}
        {view === 'categories' && (!user || user.role === 'CUSTOMER') && <CategoriesView setView={setView} setActiveCategory={setActiveCategory} />}
        
        {view === 'product' && (!user || user.role === 'CUSTOMER') && (
          <ProductDetailView 
            product={selectedProduct} 
            addToCart={addToCart} 
            cart={cart} 
            removeFromCart={removeFromCart} 
            setView={setView} 
          />
        )}

        {view === 'account' && (!user || user.role === 'CUSTOMER') && <AccountView user={user} onLogout={handleLogout} setView={setView} />}
        {view === 'help' && (!user || user.role === 'CUSTOMER') && <HelpView setView={setView} />}
        
        {view === 'seller' && <SellerDashboard user={user} onLogout={handleLogout} />}
        {view === 'pending' && <PendingApprovalView onLogout={handleLogout} />}
        {view === 'admin' && <AdminDashboardView user={user} onLogout={handleLogout} />}
      </main>

      {/* --- YAHAN ADD KIYA HAI NAYA FOOTER --- */}
      <Footer setView={setView} />

      {/* --- AESTHETIC FLOATING PILL BOTTOM NAVIGATION (MOBILE) --- */}
      {/* 🔥 LEAK FIXED: Only Customers see Mobile Bottom Nav */}
      {(!user || user.role === 'CUSTOMER') && (
        <div className="md:hidden fixed bottom-6 left-5 right-5 bg-white/90 backdrop-blur-2xl border border-white/50 z-50 flex justify-around items-center py-2.5 px-2 rounded-[2rem] shadow-[0_15px_40px_rgba(0,0,0,0.12)]">
           <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-2xl transition-all ${view === 'home' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={view === 'home' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              <span className="text-[10px] font-black">Home</span>
           </button>
           
           <button onClick={() => setView('categories')} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-2xl transition-all ${view === 'categories' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              <span className="text-[10px] font-black">Categories</span>
           </button>

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
   ULTRA-PREMIUM BENTO BOX CATEGORIES
========================================= */
function CategoriesView({ setView, setActiveCategory }) {
  // 🔥 FEATURE 1: Advanced Data with Offers & Trending Tags
  const CATEGORIES_DATA = [
    { name: 'Fresh', icon: '🥑', img: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=600&q=80', items: '120+ Items', trending: true, offer: 'Up to 20% Off', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { name: 'Grocery', icon: '🌾', img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=600&q=80', items: '450+ Items', trending: false, offer: 'Free Delivery', bg: 'bg-amber-50', text: 'text-amber-700' },
    { name: 'Electronics', icon: '🎧', img: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=600&q=80', items: '85+ Items', trending: true, offer: 'New Arrivals', bg: 'bg-blue-50', text: 'text-blue-700' },
    { name: 'Fashion', icon: '👕', img: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=600&q=80', items: '320+ Items', trending: false, offer: 'Flat 50% Off', bg: 'bg-pink-50', text: 'text-pink-700' },
    { name: 'Beauty', icon: '💄', img: 'https://images.unsplash.com/photo-1596462502278-27bf85033e5a?auto=format&fit=crop&w=600&q=80', items: '150+ Items', trending: true, offer: 'Buy 1 Get 1', bg: 'bg-rose-50', text: 'text-rose-700' },
    { name: 'Home', icon: '🛋️', img: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=600&q=80', items: '90+ Items', trending: false, offer: null, bg: 'bg-teal-50', text: 'text-teal-700' },
    { name: 'Kids', icon: '🧸', img: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80', items: '210+ Items', trending: false, offer: 'Extra 10% Off', bg: 'bg-purple-50', text: 'text-purple-700' },
    { name: '50% Off Zone', icon: '🏷️', img: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=600&q=80', items: 'Clearance', trending: true, offer: 'Mega Sale', bg: 'bg-red-50', text: 'text-red-700' },
    { name: 'School Time', icon: '🎒', img: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=600&q=80', items: '60+ Items', trending: false, offer: null, bg: 'bg-indigo-50', text: 'text-indigo-700' },
    { name: "Father's Day", icon: '👨', img: 'https://images.unsplash.com/photo-1622384784422-95f26487ff63?auto=format&fit=crop&w=600&q=80', items: 'Gifts', trending: true, offer: 'Special Combo', bg: 'bg-gray-100', text: 'text-gray-800' },
  ];

  // 🔥 FEATURE 2: Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const filters = ['All', '🔥 Trending', '🎁 Offers', '🆕 New'];

  // Smart Filtering Logic
  const filteredCategories = CATEGORIES_DATA.filter(cat => {
    const matchesSearch = cat.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    
    if (activeFilter === '🔥 Trending') return cat.trending;
    if (activeFilter === '🎁 Offers') return cat.offer !== null;
    return true; // 'All' or 'New'
  });

  const trendingCategories = CATEGORIES_DATA.filter(cat => cat.trending);

  const handleCategoryClick = (catName) => {
    setActiveCategory(catName);
    setView('home');
  };

  return (
    <div className="max-w-[1400px] mx-auto pt-2 pb-40 animate-fade-in-up relative z-10 bg-[#fcfcfc] min-h-screen">
      
      {/* 🚀 FEATURE 3: Glassmorphic Sticky Header + Search Bar */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl pt-6 pb-4 px-4 md:px-8 border-b border-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.02)]">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView('home')} 
              className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-200 font-bold text-xl hover:bg-gray-50 active:scale-90 transition-all cursor-pointer text-gray-700"
            >
              ←
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight leading-none">
                Aisles
              </h1>
              <p className="text-[11px] md:text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">
                Discover what you need
              </p>
            </div>
          </div>
          {/* Decorative Elements */}
          <div className="hidden md:flex gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse delay-75"></span>
          </div>
        </div>

        {/* 🔍 Search Bar */}
        <div className="relative w-full group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400 group-focus-within:text-[#005af0] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search for categories (e.g., Fresh, Electronics)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-100/80 border-2 border-transparent focus:border-[#005af0]/30 focus:bg-white text-gray-900 text-sm font-bold rounded-2xl pl-11 pr-4 py-3.5 outline-none transition-all duration-300 shadow-inner placeholder-gray-400"
          />
        </div>

        {/* 🏷️ Filter Pills */}
        <div className="flex gap-2 mt-4 overflow-x-auto hide-scroll pb-1">
          {filters.map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`whitespace-nowrap px-5 py-2 rounded-full text-xs font-black tracking-wide transition-all duration-300 active:scale-95 border ${
                activeFilter === filter 
                  ? 'bg-[#005af0] text-white border-[#005af0] shadow-[0_8px_20px_rgba(0,90,240,0.25)]' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6">
        
        {/* 🌟 FEATURE 4: VIP Trending Scroll (Only visible when 'All' is selected and no search) */}
        {activeFilter === 'All' && searchQuery === '' && (
          <div className="mb-10">
            <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
              🔥 Trending Right Now
            </h2>
            <div className="flex gap-4 overflow-x-auto hide-scroll pb-6 -mx-4 px-4 md:mx-0 md:px-0">
              {trendingCategories.map((cat, i) => (
                <div 
                  key={`trend-${i}`}
                  onClick={() => handleCategoryClick(cat.name)}
                  className="min-w-[260px] md:min-w-[300px] h-[160px] relative rounded-[1.5rem] overflow-hidden group cursor-pointer shadow-sm border border-gray-100 active:scale-[0.97] transition-transform flex-shrink-0"
                >
                  <img src={cat.img} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-900/90 via-gray-900/40 to-transparent"></div>
                  
                  <div className="absolute inset-0 p-5 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <span className="text-3xl drop-shadow-md bg-white/20 backdrop-blur-md w-12 h-12 flex items-center justify-center rounded-2xl border border-white/20">{cat.icon}</span>
                      {cat.offer && <span className="bg-red-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded-lg shadow-lg animate-pulse">{cat.offer}</span>}
                    </div>
                    <div>
                      <h3 className="text-white font-black text-2xl drop-shadow-md">{cat.name}</h3>
                      <p className="text-gray-300 font-bold text-xs">{cat.items}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🧊 FEATURE 5: Zippy Main Grid (New Modern Layered Cards) */}
        <h2 className="text-lg font-black text-gray-900 mb-4">
          {searchQuery ? 'Search Results' : (activeFilter === 'All' ? 'All Aisles' : activeFilter)}
        </h2>
        
        {filteredCategories.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-6xl mb-4 block">🔍</span>
            <h3 className="text-xl font-black text-gray-800">No categories found</h3>
            <p className="text-gray-500 font-bold text-sm mt-2">Try searching for something else!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredCategories.map((cat, i) => (
              <div 
                key={i} 
                onClick={() => handleCategoryClick(cat.name)}
                className="relative bg-white rounded-[1.5rem] p-3 md:p-4 hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all duration-300 cursor-pointer group border border-gray-100 active:scale-[0.97] flex flex-col h-[220px] md:h-[260px] overflow-hidden"
              >
                {/* Top Half: Image inside a nested rounded box */}
                <div className={`w-full h-32 md:h-40 rounded-2xl overflow-hidden relative mb-3 ${cat.bg}`}>
                  <img src={cat.img} alt={cat.name} className="w-full h-full object-cover mix-blend-overlay opacity-80 group-hover:scale-110 transition-transform duration-700" />
                  
                  {/* Floating Icon */}
                  <div className="absolute top-3 left-3 w-8 h-8 md:w-10 md:h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm border border-gray-100">
                    <span className="text-base md:text-lg">{cat.icon}</span>
                  </div>

                  {/* Offer Badge inside Image */}
                  {cat.offer && (
                    <div className="absolute bottom-3 left-3 bg-gray-900/80 backdrop-blur-md text-white text-[9px] font-black px-2 py-1 rounded-lg border border-white/10 uppercase tracking-wide">
                      {cat.offer}
                    </div>
                  )}
                </div>

                {/* Bottom Half: Text Info */}
                <div className="flex-1 flex flex-col justify-end px-1">
                  <h3 className="font-black text-gray-900 text-base md:text-lg tracking-tight group-hover:text-[#005af0] transition-colors line-clamp-1">{cat.name}</h3>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-[10px] md:text-xs font-bold text-gray-400">{cat.items}</p>
                    <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-[#005af0] group-hover:text-white transition-colors text-gray-400 text-xs">
                      →
                    </div>
                  </div>
                </div>
                
                {/* Active Hover Border Effect */}
                <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#005af0]/10 rounded-[1.5rem] pointer-events-none transition-colors"></div>
              </div>
            ))}
          </div>
        )}
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
                            <img 
                 src={item.imagePath.startsWith('http') ? item.imagePath : getImgSrc(item.imagePath)} 
                 className="w-8 h-8 object-contain mix-blend-multiply" 
                 alt=""
                 onError={(e) => e.target.src='https://via.placeholder.com/50'} 
               />
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
              {filteredProducts.map((p, index) => {
  // 5 Premium Themes ka array (Blue, Rose, Emerald, Purple, Orange)
  const THEMES = [
    { bg: 'hover:bg-blue-50/50', border: 'hover:border-blue-300', glow: 'hover:shadow-[0_15px_30px_rgba(37,99,235,0.15)]', imgBg: 'from-blue-50/50 group-hover:from-blue-200/60', btn: 'text-blue-600 group-hover:bg-blue-600 group-hover:text-white', badge: 'bg-[#0b5cff]', title: 'group-hover:text-blue-700' },
    { bg: 'hover:bg-rose-50/50', border: 'hover:border-rose-300', glow: 'hover:shadow-[0_15px_30px_rgba(225,29,72,0.15)]', imgBg: 'from-rose-50/50 group-hover:from-rose-200/60', btn: 'text-rose-600 group-hover:bg-rose-600 group-hover:text-white', badge: 'bg-[#e11d48]', title: 'group-hover:text-rose-700' },
    { bg: 'hover:bg-emerald-50/50', border: 'hover:border-emerald-300', glow: 'hover:shadow-[0_15px_30px_rgba(16,185,129,0.15)]', imgBg: 'from-emerald-50/50 group-hover:from-emerald-200/60', btn: 'text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white', badge: 'bg-[#059669]', title: 'group-hover:text-emerald-700' },
    { bg: 'hover:bg-purple-50/50', border: 'hover:border-purple-300', glow: 'hover:shadow-[0_15px_30px_rgba(147,51,234,0.15)]', imgBg: 'from-purple-50/50 group-hover:from-purple-200/60', btn: 'text-purple-600 group-hover:bg-purple-600 group-hover:text-white', badge: 'bg-[#7c3aed]', title: 'group-hover:text-purple-700' },
    { bg: 'hover:bg-orange-50/50', border: 'hover:border-orange-300', glow: 'hover:shadow-[0_15px_30px_rgba(249,115,22,0.15)]', imgBg: 'from-orange-50/50 group-hover:from-orange-200/60', btn: 'text-orange-600 group-hover:bg-orange-600 group-hover:text-white', badge: 'bg-[#ea580c]', title: 'group-hover:text-orange-700' }
  ];
  
  // Index ke hisaab se theme pick hogi
  const ct = THEMES[index % THEMES.length];

  return (
    <div key={p.id || p._id} onClick={() => openProduct(p)} className={`bg-gradient-to-b from-white to-gray-50 rounded-[1.5rem] p-4 studio-shadow transition-all duration-500 cursor-pointer group flex flex-col h-full relative overflow-hidden border border-white hover:-translate-y-1.5 ${ct.bg} ${ct.border} ${ct.glow}`}>
      
      {/* Sunlit effect filter */}
      <div className="absolute inset-0 sunlit-glow pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity duration-500"></div>
      
      {/* Dynamic Bestseller Badge */}
      <div className={`absolute top-0 left-0 text-white text-[9px] font-black px-3 py-1.5 rounded-br-xl rounded-tl-[1.5rem] shadow-sm z-10 uppercase tracking-widest ${ct.badge}`}>Bestseller</div>
      
      {/* Image with Dynamic Glow Background */}
      <div className={`h-28 md:h-36 w-full mb-3 rounded-xl overflow-hidden flex items-center justify-center p-2 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] transition-colors duration-500 mt-2 ${ct.imgBg} to-transparent`}>
         <img src={p.imagePath?.startsWith('http') ? p.imagePath : `${API_URL.replace('/api', '')}/uploads/${p.imagePath}`} alt={p.title} className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-700 drop-shadow-md" onError={(e) => e.target.src='https://via.placeholder.com/400'} />
      </div>
      
      <div className="flex flex-col flex-1 justify-between relative z-10">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-black">★ 4.5</span>
            <span className="text-[9px] text-gray-400 font-bold flex items-center gap-1"><span className="w-1 h-1 bg-gray-300 rounded-full"></span> 12 Mins</span>
          </div>
          <h4 className={`text-xs md:text-sm font-black text-gray-800 line-clamp-2 leading-snug mt-1.5 transition-colors duration-300 ${ct.title}`}>{p.title}</h4>
        </div>
        
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex items-end justify-between relative">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm md:text-lg font-black text-gray-900 drop-shadow-sm">₹{(p.price)}</span>
              <span className="text-[10px] text-gray-400 line-through font-bold">₹{(p.price * 1.15).toFixed(0)}</span>
            </div>
          </div>
          
          <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} className={`absolute -right-2 -bottom-2 w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-2xl font-light transition-all shadow-[0_4px_10px_rgba(0,0,0,0.05)] cursor-pointer ${ct.btn}`}>
             +
          </button>
        </div>
      </div>
    </div>
  );
})}
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
   PRODUCT DETAIL PAGE (CLEANED - NO ADMIN CONTROLS)
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
          <img src={product.imagePath?.startsWith('http') ? product.imagePath : `${API_URL.replace('/api', '')}/uploads/${product.imagePath}`} alt={product.title} className="max-h-full max-w-full object-contain mix-blend-multiply hover:scale-105 transition-transform duration-500" onError={(e) => e.target.src='https://via.placeholder.com/400'} />  
          </div>
          <div className="bg-white rounded-2xl flex items-center justify-between text-gray-900 border-2 border-blue-600 overflow-hidden shadow-sm">
            {(() => {
              const cartItem = cart.find(item => (item._id || item.id) === (product._id || product.id));
              const currentQty = cartItem ? cartItem.quantity : 0;

              return currentQty === 0 ? (
                <button onClick={() => addToCart(product)} className="w-full py-4 font-black text-base md:text-lg text-blue-600 hover:bg-blue-50 transition cursor-pointer">
                  ADD TO CART
                </button>
              ) : (
                <div className="w-full flex items-center justify-between px-6 md:px-8 py-2 md:py-3 bg-blue-600 text-white">
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
// 👇👇 PASTE THE NEW COMPONENT HERE (AT THE VERY BOTTOM OF THE FILE) 👇👇

// Component for the Edit Product Modal (Popup Form)
function EditProductModal({ product, onClose }) {
  // Store the form input values
  const [formData, setFormData] = useState({
    title: product.title,
    price: product.price,
    category: product.category,
  });
  const [file, setFile] = useState(null);

  // Update state when user types in the text fields
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Update state when user selects a new image
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // Send the updated data to the backend when form is submitted
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Using FormData to send text and image file together
    const data = new FormData();
    data.append('title', formData.title);
    data.append('price', formData.price);
    data.append('category', formData.category);
    
    if (file) {
      data.append('file', file);
    }

    try {
      // Calling the correct backend API URL with /api/products/edit/
      const response = await fetch(`https://zippy-backend-vc4w.onrender.com/api/products/edit/${product._id || product.id}`, {
        method: 'PUT',
        body: data
      });

      if (response.ok) {
        alert("Product updated successfully!");
        window.location.reload(); // Refresh to see updated data
      } else {
        alert("Failed to update product.");
      }
    } catch (error) {
      console.error("Error updating product:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center">
      <div className="bg-white p-6 rounded-2xl w-[400px] shadow-xl">
        <h2 className="text-2xl font-bold mb-4">Edit Product</h2>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input type="text" name="title" value={formData.title} onChange={handleChange} required placeholder="Product Title" className="p-3 border border-gray-300 rounded-lg" />
          <input type="number" name="price" value={formData.price} onChange={handleChange} required placeholder="Price" className="p-3 border border-gray-300 rounded-lg" />
          <select 
  name="category" 
  value={formData.category} /* (Agar Restock wale mein naam alag ho, toh apna purana value/onChange rehne dena) */
  onChange={handleChange} 
  required 
  className="p-3 w-full border border-gray-300 rounded-lg bg-white text-gray-700 outline-none cursor-pointer"
>
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
          
          <label className="text-sm font-bold text-gray-600">Update Image (Optional):</label>
          <input 
  type="file" 
  onChange={handleFileChange} 
  className="p-2 w-full border border-gray-300 rounded-lg cursor-pointer file:cursor-pointer file:bg-blue-50 file:text-blue-700 file:border-0 file:px-4 file:py-2 file:rounded-md file:font-semibold hover:file:bg-blue-100 transition-all" 
/>
          
          <div className="flex gap-4 mt-4">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-3 flex-1 rounded-lg font-bold cursor-pointer transition-colors shadow-sm">
  Save Changes
</button>
<button type="button" onClick={onClose} className="bg-red-500 hover:bg-red-600 text-white p-3 flex-1 rounded-lg font-bold cursor-pointer transition-colors shadow-sm">
  Cancel
</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================
   CART DRAWER (SMART DYNAMIC SCRATCH CARD)
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
      // 🔥 BUG FIX: SMART BUSINESS LOGIC 🔥
      // Max win amount ya toh ₹50 hoga, ya Cart ka Total (agar cart 50 se kam hai).
      const maxWin = Math.min(50, Math.floor(inrTotal));
      
      // Amount 1 se maxWin ke beech generate hoga. Agar cart 0 hai to 0.
      const luckyAmount = maxWin > 0 ? Math.floor(Math.random() * maxWin) + 1 : 0;
      setWinAmount(luckyAmount);
    }
  }, [scratched]); // Yeh logic cart open hone pe sirf 1 baar set hoga

  const handleScratch = () => {
    setScratched(true);
    setDiscount(winAmount);
  };

  // Safety Feature: Agar user scratch karne ke BAAD koi item cart se hata de 
  // aur cart ka total discount se chhota ho jaye, tabhi hum discount adjust karenge.
  const actualDiscount = scratched ? Math.min(discount, inrTotal) : 0;
  
  const deliveryFee = 2;
  const finalAmount = parseFloat((inrTotal - actualDiscount + deliveryFee).toFixed(2)); 

  const handleCheckout = async () => {
    if(!user) { setIsCartOpen(false); setIsAuthOpen(true); return; }
    
    if (finalAmount <= 0) { alert("Invalid order amount."); return; }

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
        description: `Order total after ₹${actualDiscount} Scratch Discount`, 
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
                  
                  {actualDiscount > 0 && (
                     <div className="flex justify-between text-green-600 bg-green-50 p-3 rounded-xl border border-green-100 animate-fade-in-up">
                        <span className="flex items-center gap-1 font-black">🎟️ Lucky Discount</span>
                        <span className="font-black">-₹{actualDiscount}</span>
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
   PENDING APPROVAL VIEW (NAYA CODE YAHAN AAYEGA)
========================================= */
function PendingApprovalView({ onLogout }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.05)] max-w-md w-full text-center border border-gray-100 animate-fade-in-up">
        <div className="w-24 h-24 bg-yellow-50 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl shadow-sm border-4 border-yellow-100/50">⏳</div>
        <h2 className="text-2xl font-black text-gray-900 mb-4 tracking-tight">Account Under Review</h2>
        <p className="text-gray-600 mb-8 leading-relaxed text-sm">Welcome to Zippy! Your seller application has been received successfully. Our admin team is reviewing your profile to maintain platform quality. Please check back later.</p>
        <button onClick={onLogout} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold transition-all shadow-md cursor-pointer hover:shadow-lg">Logout & Check Later</button>
      </div>
    </div>
  );
}

/* =========================================
   GOD MODE: SUPER ADMIN DASHBOARD
========================================= */
function AdminDashboardView({ user, onLogout }) {
  const [pendingSellers, setPendingSellers] = useState([]);

  // Backend se pending sellers mangwa rahe hain
  const fetchPendingSellers = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/pending-sellers`);
      const data = await res.json();
      setPendingSellers(data);
    } catch (err) {
      console.error("Error fetching sellers:", err);
    }
  };

  useEffect(() => {
    fetchPendingSellers();
  }, []);

  // Approve button ka function
  const handleApprove = async (sellerId) => {
    const isConfirmed = window.confirm("Are you sure you want to approve this seller?");
    if (!isConfirmed) return;

    try {
      const res = await fetch(`${API_URL}/admin/approve-seller/${sellerId}`, { 
        method: 'PUT' 
      });
      
      if (res.ok) {
        alert("Seller Approved Successfully! 🚀");
        // Screen se us seller ko turant hata do
        setPendingSellers(pendingSellers.filter(s => s._id !== sellerId));
      } else {
        alert("Something went wrong!");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 relative z-10 selection:bg-blue-200">
      <div className="max-w-[1200px] mx-auto py-10 px-4 animate-fade-in-up">
        
        {/* Header */}
        <div className="bg-gray-900 rounded-[2rem] p-8 flex flex-col md:flex-row justify-between items-center shadow-2xl mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">👑</div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Admin Control Center</h1>
              <p className="text-gray-400 font-bold mt-1">Manage Zippy Platform</p>
            </div>
          </div>
          <button onClick={onLogout} className="mt-4 md:mt-0 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md cursor-pointer">
            Admin Logout
          </button>
        </div>

        {/* Pending Requests Section */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-white border-b border-gray-100 px-8 py-6 flex items-center justify-between">
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              Pending Seller Requests 
              <span className="bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full">{pendingSellers.length}</span>
            </h2>
          </div>

          <div className="p-8">
            {pendingSellers.length === 0 ? (
              <div className="text-center py-10">
                <span className="text-6xl opacity-30 mb-4 block">☕</span>
                <h3 className="text-xl font-bold text-gray-800">No pending requests.</h3>
                <p className="text-gray-500">Your platform is all caught up!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingSellers.map((seller) => (
                  <div key={seller._id} className="bg-white border-2 border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all flex flex-col">
                    <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-2xl font-black text-gray-400 mb-4 uppercase">
                      {seller.name.charAt(0)}
                    </div>
                    <h3 className="font-black text-xl text-gray-900">{seller.name}</h3>
                    <p className="text-gray-500 font-bold text-sm mb-6">{seller.email}</p>
                    
                    <button 
                      onClick={() => handleApprove(seller._id)} 
                      className="mt-auto w-full bg-green-500 hover:bg-green-600 text-white font-black py-3 rounded-xl shadow-md shadow-green-500/20 hover:-translate-y-1 transition-all cursor-pointer"
                    >
                      Approve Seller
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
   OP LEVEL SELLER DASHBOARD (ULTRA PREMIUM)
========================================= */
function SellerDashboard({ user, onLogout }) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [newProduct, setNewProduct] = useState({ title: '', price: '', category: 'Fresh', file: null });

  // 1. ADDED STATE FOR EDITING
  const [editingProduct, setEditingProduct] = useState(null);

  const loadData = () => {
    // 1. Sirf is seller ke products fetch karo
    fetch(`${API_URL}/products/all`)
      .then(res => res.json())
      .then(data => setProducts(data.filter(p => p.sellerId === user.id)));
    
    // 🔥 2. MULTI-VENDOR FIX: Ab sirf is seller ke orders fetch honge!
    fetch(`${API_URL}/orders/seller/${user.id}`)
      .then(res => res.json())
      .then(data => setOrders(data.reverse()));
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

  // 2. ADDED DELETE FUNCTION
  const handleDelete = async (productId) => {
    const isConfirmed = window.confirm("Are you sure you want to delete this product from your inventory?");
    if (!isConfirmed) return;

    try {
      const response = await fetch(`${API_URL}/products/delete/${productId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        alert("Product deleted successfully! 🗑️");
        loadData(); // Reloads the dashboard data automatically
      } else {
        alert("Failed to delete product.");
      }
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  };

  // 3. ADDED EDIT CLICK FUNCTION
  const handleEditClick = (product) => {
    setEditingProduct(product);
  };

  const activeOrders = orders.filter(o => o.status !== 'DELIVERED').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 pb-24 md:pb-20 relative z-10 selection:bg-indigo-200">
      
      {/* 4. RENDER EDIT MODAL IF EDITING */}
      {editingProduct && (
        <EditProductModal 
          product={editingProduct} 
          onClose={() => { setEditingProduct(null); loadData(); }} 
        />
      )}

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
        
        {/* 3. PREMIUM RESTOCK INVENTORY FORM */}
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

        {/* 5. MANAGE LIVE INVENTORY */}
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden border border-gray-100">
          <div className="bg-white px-6 md:px-8 py-5 border-b border-gray-100 flex justify-between items-center sticky top-0 z-10">
             <h3 className="font-black text-gray-900 text-lg md:text-xl flex items-center gap-2">
               Manage Live Inventory ⚙️
             </h3>
          </div>
          <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto hide-scroll bg-gray-50/50">
            {products.map(p => (
              <div key={p._id} className="bg-white p-4 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                <div>
                  <div className="h-32 w-full bg-gray-50 rounded-xl flex items-center justify-center mb-3 overflow-hidden">
                  <img src={p.imagePath?.startsWith('http') ? p.imagePath : `${API_URL.replace('/api', '')}/uploads/${p.imagePath}`} alt={p.title} className="max-h-full max-w-full object-contain mix-blend-multiply" onError={(e) => e.target.src='https://via.placeholder.com/150'} /> 
                  </div>
                  <h4 className="font-black text-md text-gray-900 truncate">{p.title}</h4>
                  <p className="text-indigo-600 font-black text-lg mb-4">₹{p.price}</p>
                </div>
                
                {/* Admin Action Buttons */}
                <div className="flex gap-2 mt-auto">
                  <button 
                    onClick={() => handleEditClick(p)} 
                    className="flex-1 bg-blue-50 text-blue-600 font-bold py-2 rounded-xl text-xs hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(p._id || p.id)} 
                    className="flex-1 bg-red-50 text-red-600 font-bold py-2 rounded-xl text-xs hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            
            {products.length === 0 && (
              <div className="col-span-full text-center py-10">
                <p className="text-gray-500 font-bold">Your inventory is empty. Start adding items above!</p>
              </div>
            )}
          </div>
        </div>

        {/* 4. MODERN INCOMING ORDERS FEED (UPGRADED WITH ITEM DETAILS) */}
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden border border-gray-100">
          <div className="bg-white px-6 md:px-8 py-5 border-b border-gray-100 flex justify-between items-center sticky top-0 z-10">
             <h3 className="font-black text-gray-900 text-lg md:text-xl flex items-center gap-2">
               Live Orders Feed <span className="relative flex h-3 w-3 ml-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>
             </h3>
          </div>
          <div className="p-4 md:p-6 grid gap-4 max-h-[600px] overflow-y-auto hide-scroll bg-gray-50/50">
            {orders.map(o => (
              <div key={o._id} className={`flex flex-col bg-white p-5 md:p-6 rounded-[1.5rem] border ${o.status === 'DELIVERED' ? 'border-gray-200 opacity-60 grayscale-[30%]' : 'border-indigo-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(79,70,229,0.1)]'} transition-all duration-300 gap-4`}>
                
                {/* Top Section: Customer Info & Buttons */}
                <div className="flex flex-col md:flex-row justify-between md:items-start md:items-center gap-4">
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

                {/* 🔥 NEW FEATURE: Items Details for Seller to Pack */}
                {o.items && o.items.length > 0 && (
                  <div className="mt-2 pt-4 border-t border-dashed border-indigo-100">
                    <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-3">Items to Pack</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {o.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-50">
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-1 shadow-sm shrink-0 border border-gray-100">
                            <img 
                              src={item.imagePath?.startsWith('http') ? item.imagePath : `${API_URL.replace('/api', '')}/uploads/${item.imagePath}`} 
                              alt={item.title} 
                              className="w-full h-full object-contain mix-blend-multiply" 
                              onError={(e) => e.target.src='https://via.placeholder.com/50'} 
                            />
                          </div>
                          <div className="flex-1">
                            <h6 className="text-xs font-bold text-gray-800 line-clamp-1">{item.title}</h6>
                            <p className="text-[10px] font-black text-indigo-600 mt-0.5">Qty: {item.quantity}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
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
   PREMIUM ACCOUNT VIEW (WITH ITEM DETAILS)
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

                {/* 🔥 NAYA PREMIUM ITEM LIST FEATURE YAHAN ADD KIYA HAI */}
                {o.items && o.items.length > 0 && (
                  <div className="my-4 bg-gray-50/80 rounded-xl p-3 md:p-4 border border-gray-100">
                    <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Items in this packet</h5>
                    <div className="space-y-3">
                      {o.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1 border border-gray-200 shrink-0 shadow-sm">
                            {/* Images proper render hongi is logic se */}
                            <img src={getImgSrc(item.imagePath)} alt={item.title} className="w-full h-full object-contain mix-blend-multiply" onError={(e) => e.target.src='https://via.placeholder.com/50'} />
                          </div>
                          <div className="flex-1">
                            <h6 className="text-sm font-bold text-gray-800 line-clamp-1">{item.title}</h6>
                            <p className="text-[11px] font-bold text-gray-500 mt-0.5">Qty: {item.quantity}</p>
                          </div>
                          <span className="text-sm font-black text-gray-900">₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* 🔥 END OF ITEM LIST */}

                <div className="mt-4 pt-4 border-t border-gray-100">
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
function Footer({ setView, currentView = 'home' }) {
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [activeLink, setActiveLink] = useState(currentView);

  // Quick Links with icons
  const quickLinks = [
    { name: '🏠 Home', targetView: 'home' },
    { name: '📋 Menu', targetView: 'categories' },
    { name: '🎯 Offers', targetView: 'home' },
    { name: '💬 Contact', targetView: 'help' }
  ];

  // Handle page change with animation
  const handlePageChange = (targetView, linkName) => {
    setActiveLink(targetView);
    
    const footer = document.querySelector('footer');
    footer.style.opacity = '0.7';
    footer.style.transform = 'scale(0.98)';
    
    setTimeout(() => {
      setView(targetView);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      setTimeout(() => {
        footer.style.opacity = '1';
        footer.style.transform = 'scale(1)';
      }, 100);
    }, 200);
  };

  // Handle subscribe with loading state
  const handleSubscribe = async (e) => {
    e.preventDefault();
    setIsSubscribing(true);
    const emailInput = e.target.elements[0].value;

    try {
      const res = await fetch(`https://zippy-backend-vc4w.onrender.com/api/admin/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput })
      });

      if (res.ok) {
        alert("🎉 Thanks for subscribing to Zippy! We'll keep you updated. 🚀");
        e.target.reset();
      } else {
        const data = await res.json();
        alert(data.message || "❌ Failed to subscribe. Try again!");
      }
    } catch (error) {
      alert("⚠️ Server error! Are you connected to the internet?");
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <footer 
      className="w-full bg-[#fcfcfc] pt-16 pb-8 border-t border-gray-100 transition-all duration-500"
      style={{ 
        opacity: 1, 
        transform: 'scale(1)',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <div className="max-w-[1200px] mx-auto px-4 md:px-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-16">
          
          {/* BRANDING SECTION */}
          <div className="flex-1 w-full">
            <h1 className="text-[46px] font-black tracking-tighter text-[#adb5bd] leading-none mb-3 lowercase transition-colors duration-300">
              zippy
            </h1>
            <p 
              className="text-[14px] md:text-[16px] font-medium text-[#7a8089] flex items-center justify-start tracking-tight transition-colors duration-300"
              style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              Crafted with 
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px] md:w-[17px] md:h-[17px] mx-1 text-[#005af0] transition-all duration-300 hover:scale-125 hover:rotate-12">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              in Patna, India
            </p>
            <p className="text-[13px] text-[#9aa0a9] tracking-wide font-light transition-colors duration-300">
              ☕ Freshly Brewed • Every Day
            </p>
          </div>

          {/* QUICK LINKS SECTION */}
          <div className="flex-1 w-full">
            <h4 className="font-black text-[#a1a1aa] mb-5 uppercase tracking-widest text-[11px] transition-colors duration-300">
              Quick Links
            </h4>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <button 
                    onClick={() => handlePageChange(link.targetView, link.name)}
                    className={`text-[14px] font-bold text-[#6b7280] transition-all duration-300 cursor-pointer bg-transparent border-none p-0 text-left group flex items-center gap-2 ${
                      activeLink === link.targetView ? 'text-[#005af0] scale-105' : ''
                    }`}
                  >
                    <span className="group-hover:translate-x-2 transition-transform duration-300">
                      {link.name}
                    </span>
                    {activeLink === link.targetView && (
                      <span className="w-2 h-2 bg-[#005af0] rounded-full animate-pulse"></span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* CONNECT WITH US & SUBSCRIBE SECTION - FIXED FOR MOBILE */}
          <div className="flex-[1.5] w-full">
            <h4 className="font-black text-[#a1a1aa] mb-5 uppercase tracking-widest text-[11px] transition-colors duration-300">
              Connect With Us
            </h4>
            
            <div className="flex gap-3 mb-6 flex-wrap">
              {/* INSTAGRAM */}
              <a href="https://www.instagram.com/_s.a.t.y.a.m.m_/" target="_blank" rel="noreferrer" 
                className="w-10 h-10 bg-[#f3f4f6] text-[#6b7280] rounded-full flex items-center justify-center hover:bg-gradient-to-tr hover:from-yellow-400 hover:via-pink-500 hover:to-purple-600 hover:text-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              {/* FACEBOOK */}
              <a href="https://facebook.com/your_id" target="_blank" rel="noreferrer" 
                className="w-10 h-10 bg-[#f3f4f6] text-[#6b7280] rounded-full flex items-center justify-center hover:bg-blue-600 hover:text-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M22.675 0h-21.35C.598 0 0 .598 0 1.325v21.351C0 23.402.598 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.598 1.323-1.325V1.325C24 .598 23.402 0 22.675 0z"/></svg>
              </a>
              {/* X (Twitter) */}
              <a href="https://twitter.com/your_id" target="_blank" rel="noreferrer" 
                className="w-10 h-10 bg-[#f3f4f6] text-[#6b7280] rounded-full flex items-center justify-center hover:bg-black hover:text-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              {/* YOUTUBE */}
              <a href="https://www.youtube.com/channel/UC27JTGeeqX4ZxROqmyuhypQ/posts?pvf=CAI%253D" target="_blank" rel="noreferrer" 
                className="w-10 h-10 bg-[#f3f4f6] text-[#6b7280] rounded-full flex items-center justify-center hover:bg-red-600 hover:text-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
            </div>

            <p className="text-[13px] font-bold text-[#6b7280] mb-3 transition-colors duration-300">
              Subscribe for fresh updates ☕
            </p>
            
            {/* 🔥 FIXED: Mobile Responsive Subscribe Form */}
            <form className="flex flex-col sm:flex-row gap-2 w-full max-w-[380px]" onSubmit={handleSubscribe}>
              <input 
                type="email" 
                required 
                placeholder="Your email" 
                className="flex-1 w-full bg-white border border-gray-200 px-4 py-2.5 rounded-[2rem] text-sm font-bold text-gray-800 focus:outline-none focus:border-[#005af0] focus:ring-2 focus:ring-[#005af0]/20 transition-all duration-300 shadow-sm placeholder-gray-400"
              />
              <button 
                type="submit" 
                disabled={isSubscribing}
                className="w-full sm:w-auto bg-[#005af0] text-white font-black px-5 py-2.5 rounded-[2rem] text-sm hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center whitespace-nowrap"
              >
                {isSubscribing ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-xs sm:text-sm">Loading...</span>
                  </>
                ) : (
                  <span>Subscribe</span>
                )}
              </button>
            </form>
          </div>

        </div>

        {/* BOTTOM LEGAL BAR */}
        <div className="pt-6 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 text-[12px] font-bold text-[#9ca3af] transition-colors duration-300">
          <p>© 2026 Zippy Cafe. All rights reserved.</p>
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-gray-800 transition-colors">
              Privacy Policy
            </a>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-gray-800 transition-colors">
              Terms of Service
            </a>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-gray-800 transition-colors">
              Cookie Policy
            </a>
          </div>
        </div>
        
      </div>
    </footer>
  );
}