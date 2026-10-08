import React, { useState } from 'react';
import { account, ID } from '../../appwriteConfig';
import { useAuth, useChat } from '../../store/store';
import Swal from 'sweetalert2';

interface AuthContainerProps {
  view: string;
  setView: (view: string) => void;
  setUser: (user: any) => void;
  recoveryParams: { userId: string; secret: string };
}

export const AuthContainer: React.FC<AuthContainerProps> = ({ view, setView, setUser, recoveryParams }) => {
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // Form input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // ==========================================
  // Authentication & 8-Character Validation
  // ==========================================
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      Swal.fire({
        icon: 'error',
        title: 'Password Incorrect',
        text: 'Password must be at least 8 characters long.',
        confirmButtonColor: '#7c4dff'
      });
      return;
    }

    setIsAuthLoading(true);
    try {
      if (view === 'signup') {
        if (password !== confirmPassword) {
          Swal.fire({ icon: 'warning', title: 'Mismatch', text: 'Passwords do not match!', confirmButtonColor: '#7c4dff' });
          setIsAuthLoading(false);
          return;
        }
        const fullName = `${firstName} ${surname}`.trim();
        await account.create(ID.unique(), email, password, fullName);
        await account.createEmailPasswordSession(email, password);
      } else {
        await account.createEmailPasswordSession(email, password);
      }
      
      const session = await account.get();
      setUser(session);

      try {
        const prefs = await account.getPrefs();
        useAuth.getState().setUser({
          id: session.$id,
          name: session.name,
          email: session.email,
          avatar: prefs?.avatar || "/imgs/default-avatar.jpg",
        });
        useChat.getState().loadUserHistory(session.$id);
      } catch (error) {
        console.error("Failed to load user preferences:", error);
        useAuth.getState().setUser({
          id: session.$id,
          name: session.name,
          email: session.email,
          avatar: "/imgs/default-avatar.jpg",
        });
        useChat.getState().loadUserHistory(session.$id);
      }

      setView('chat');
      Swal.fire({ 
        icon: 'success', 
        title: view === 'login' ? 'Logged In!' : 'Account Created!', 
        timer: 1500, 
        showConfirmButton: false, 
        toast: true, 
        position: 'top-end' 
      });
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Sign In Failed',
        text: 'Password incorrect or invalid credentials provided. Please check and try again.',
        confirmButtonColor: '#7c4dff'
      });
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSendRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    try {
      const redirectUrl = window.location.origin;
      await account.createRecovery(recoveryEmail, redirectUrl);
      Swal.fire({ icon: 'success', title: 'Recovery Email Sent!', text: 'Check your email inbox for your secure password reset link.', confirmButtonColor: '#7c4dff' });
      setView('login');
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Request Failed', text: err.message, confirmButtonColor: '#7c4dff' });
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      Swal.fire({ icon: 'error', title: 'Password Invalid', text: 'Password must be at least 8 characters long.', confirmButtonColor: '#7c4dff' });
      return;
    }
    setIsAuthLoading(true);
    try {
      await account.updateRecovery(recoveryParams.userId, recoveryParams.secret, newPassword);
      window.history.replaceState({}, document.title, window.location.pathname);
      Swal.fire({ icon: 'success', title: 'Password Updated!', text: 'Your password has been successfully reset. Please log in.', confirmButtonColor: '#28a745' });
      setView('login');
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Reset Failed', text: 'The recovery link is invalid or has expired. Please request a new one.', confirmButtonColor: '#7c4dff' });
      setView('forgot-password');
    } finally {
      setIsAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#0f111a] font-['Plus_Jakarta_Sans',sans-serif] text-white">
      
      {/* Global Navbar with Professional Vector Logo */}
      <header className="w-full px-6 lg:px-16 py-5 flex items-center justify-between border-b border-white/5 bg-[#121520]/80 backdrop-blur-md sticky top-0 z-50">
        <div onClick={() => setView('landing')} className="flex items-center space-x-3 cursor-pointer group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c4dff]/30 to-teal-500/20 border border-[#7c4dff]/40 flex items-center justify-center text-[#9670ff] shadow-lg shadow-[#7c4dff]/10 group-hover:scale-105 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <span className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            ACOMS-AI
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setView('dashboard')}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer ${view === 'dashboard' ? 'text-[#7c4dff] bg-[#7c4dff]/10' : 'text-slate-300 hover:text-white'}`}
          >
            Dashboard
          </button>
          {view !== 'login' && (
            <button
              onClick={() => setView('login')}
              className="text-sm font-semibold text-slate-300 hover:text-white px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              Login
            </button>
          )}
          {view !== 'signup' && (
            <button
              onClick={() => setView('signup')}
              className="bg-[#7c4dff] hover:bg-[#9670ff] text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-[#7c4dff]/30 cursor-pointer"
            >
              Get Started
            </button>
          )}
        </div>
      </header>

      {/* Main View Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        
        {/* Landing Page */}
        {view === 'landing' && (
          <div className="max-w-4xl w-full text-center py-16 px-8 bg-gradient-to-b from-[#1c1f2b]/95 to-[#121520]/95 border border-white/10 rounded-[32px] shadow-2xl backdrop-blur-xl relative overflow-hidden my-auto">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#7c4dff]/15 rounded-full blur-3xl pointer-events-none"></div>
            
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#7c4dff]/10 border border-[#7c4dff]/25 text-[#9670ff] text-xs font-semibold mb-6">
              🚀 Next-Gen Computer Science Intelligence Workspace
            </span>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent leading-tight">
              Engineered for code, algorithms &amp; architecture.
            </h1>
            <p className="text-slate-400 text-base md:text-lg mb-10 leading-relaxed max-w-2xl mx-auto">
              Built specifically for computer science students and software engineering teams. ACOMS-AI provides secure workspace isolation, deep technical syntax parsing, and robust AI models.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setView('signup')}
                className="bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold py-4 px-10 rounded-2xl transition-all shadow-xl shadow-[#7c4dff]/30 cursor-pointer text-base"
              >
                Get Started Free
              </button>
              <button
                onClick={() => setView('dashboard')}
                className="bg-[#252936] hover:bg-[#2a2f3d] text-white font-semibold py-4 px-10 rounded-2xl border border-white/10 transition-all cursor-pointer text-base"
              >
                Explore Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Dashboard View */}
        {view === 'dashboard' && (
          <div className="max-w-5xl w-full py-12 px-6 sm:px-10 bg-gradient-to-b from-[#1c1f2b]/95 to-[#121520]/95 border border-white/10 rounded-[32px] shadow-2xl backdrop-blur-xl my-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-6 border-b border-white/10">
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold mb-2">
                  📊 ACOMS System Dashboard
                </span>
                <h2 className="text-3xl font-extrabold text-white tracking-tight">Overview &amp; Metrics</h2>
              </div>
              <div className="mt-4 md:mt-0">
                <button 
                  onClick={() => setView('signup')} 
                  className="bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-[#7c4dff]/20 cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                <p className="text-xs text-slate-400 uppercase font-semibold">Active Sessions</p>
                <h3 className="text-2xl font-bold text-white mt-1">1,482</h3>
                <span className="text-xs text-teal-400 mt-2 inline-block">↑ 12% this week</span>
              </div>
              <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                <p className="text-xs text-slate-400 uppercase font-semibold">Code Parses</p>
                <h3 className="text-2xl font-bold text-white mt-1">34,290</h3>
                <span className="text-xs text-teal-400 mt-2 inline-block">↑ 24% efficiency</span>
              </div>
              <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                <p className="text-xs text-slate-400 uppercase font-semibold">Workspace Uptime</p>
                <h3 className="text-2xl font-bold text-white mt-1">99.98%</h3>
                <span className="text-xs text-teal-400 mt-2 inline-block">Operational</span>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#161923] border border-white/5">
              <h4 className="text-base font-bold text-white mb-2">About ACOMS-AI Infrastructure</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                ACOMS-AI delivers dedicated containerized AI parsing spaces. Each user profile handles secure historical token encryption, custom context injection, and instant multi-language algorithm compiling.
              </p>
            </div>
          </div>
        )}

        {/* Login & Signup Two-Column Layout */}
        {(view === 'login' || view === 'signup') && (
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left Column: Brand Panel */}
            <div className="hidden lg:flex lg:col-span-6 flex-col justify-center p-10 xl:p-14 bg-gradient-to-br from-[#161923] to-[#1c1f2b] border border-white/10 rounded-[32px] relative overflow-hidden shadow-2xl">
              <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#7c4dff]/10 border border-[#7c4dff]/20 text-[#9670ff] text-xs font-semibold w-max mb-6">
                <span>ACOMS-AI Developer Network</span>
              </div>
              
              <h2 className="text-3xl xl:text-5xl font-extrabold tracking-tight text-white mb-5 leading-tight">
                {view === 'login' 
                  ? 'Connect with your developer workspace securely.' 
                  : 'Build, test, and scale with intelligent AI assistance.'}
              </h2>
              
              <p className="text-slate-400 text-base xl:text-lg leading-relaxed mb-8">
                ACOMS-AI helps computer science students and engineers manage complex code repositories, evaluate syntax logic, and collaborate seamlessly.
              </p>

              <div className="space-y-4">
                <div className="flex items-start space-x-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center text-sm font-bold mt-0.5">✓</div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Isolated Private Partitions</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Your personal prompts and custom settings remain encrypted and strictly confidential.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="w-8 h-8 rounded-xl bg-[#7c4dff]/20 text-[#9670ff] flex items-center justify-center text-sm font-bold mt-0.5">⚡</div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Advanced Algorithm Parsing</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Optimized for complex logic structures, data science models, and software engineering stacks.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Authentication Card with Professional Eye Icons */}
            <div className="col-span-1 lg:col-span-6 flex justify-center">
              <div className="w-full max-w-[460px] bg-[#1c1f2b]/95 p-8 sm:p-10 rounded-[32px] border border-white/10 shadow-2xl backdrop-blur-xl">
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                    {view === 'login' ? 'Sign In' : 'Create Account'}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    {view === 'login' ? 'Enter your credentials to access your dashboard' : 'Fill in your details to get started'}
                  </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                  {view === 'signup' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          name="family-name"
                          autoComplete="family-name"
                          placeholder="Surname"
                          value={surname}
                          onChange={(e) => setSurname(e.target.value)}
                          required
                          className="bg-[#252936] border border-white/5 px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm"
                        />
                        <input
                          type="text"
                          name="given-name"
                          autoComplete="given-name"
                          placeholder="First Name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                          className="bg-[#252936] border border-white/5 px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm"
                        />
                      </div>
                      <input
                        type="tel"
                        name="tel"
                        autoComplete="tel"
                        placeholder="Phone Number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        className="bg-[#252936] border border-white/5 px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm w-full"
                      />
                    </>
                  )}

                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-[#252936] border border-white/5 px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm w-full"
                  />

                  {/* Password Input with Professional Eye Icon Toggle */}
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      name={view === 'signup' ? 'new-password' : 'current-password'}
                      autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                      placeholder="Password (8+ characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="bg-[#252936] border border-white/5 px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm w-full pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer select-none focus:outline-none"
                    >
                      {showPass ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.05 10.05 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {view === 'signup' && (
                    <div className="relative">
                      <input
                        type={showConfirmPass ? 'text' : 'password'}
                        name="new-password"
                        autoComplete="new-password"
                        placeholder="Confirm Password (8+ characters)"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        className="bg-[#252936] border border-white/5 px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm w-full pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer select-none focus:outline-none"
                      >
                        {showConfirmPass ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.05 10.05 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-[#7c4dff]/30 cursor-pointer mt-2 text-sm"
                  >
                    {isAuthLoading ? 'Please wait...' : view === 'login' ? 'Login' : 'Complete Sign Up'}
                  </button>
                </form>

                {view === 'login' && (
                  <p
                    onClick={() => setView('forgot-password')}
                    className="text-center text-sm text-[#7c4dff] hover:underline cursor-pointer mt-4"
                  >
                    Forgot password?
                  </p>
                )}

                <p
                  onClick={() => {
                    setView(view === 'login' ? 'signup' : 'login');
                    setShowPass(false);
                  }}
                  className="text-center text-sm text-slate-400 hover:text-white cursor-pointer mt-4"
                >
                  {view === 'login' ? "New here? Create an account" : 'Already have an account? Login'}
                </p>
              </div>
            </div>

          </div>
        )}

        {/* Forgot Password View */}
        {view === 'forgot-password' && (
          <div className="w-full max-w-[420px] bg-[#1c1f2b]/95 p-8 rounded-[32px] border border-white/10 shadow-2xl backdrop-blur-xl my-auto">
            <div className="mb-6">
              <h2 className="text-3xl font-extrabold tracking-tight">Reset Password</h2>
              <p className="text-sm text-slate-400 mt-1">Enter your registered email to receive a secure recovery link.</p>
            </div>

            <form onSubmit={handleSendRecoveryEmail} className="space-y-4">
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="Registered Email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                required
                className="bg-[#252936] border border-white/5 px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm w-full"
              />
              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-[#7c4dff]/30 cursor-pointer text-sm"
              >
                {isAuthLoading ? 'Sending Link...' : 'Send Recovery Link'}
              </button>
            </form>

            <p onClick={() => setView('login')} className="text-center text-sm text-slate-400 hover:text-white cursor-pointer mt-6">
              Back to Login
            </p>
          </div>
        )}

        {/* Reset Password View */}
        {view === 'reset-password' && (
          <div className="w-full max-w-[420px] bg-[#1c1f2b]/95 p-8 rounded-[32px] border border-white/10 shadow-2xl backdrop-blur-xl my-auto">
            <div className="mb-6">
              <h2 className="text-3xl font-extrabold tracking-tight">Set New Password</h2>
              <p className="text-sm text-slate-400 mt-1">Enter your new secure password below.</p>
            </div>

            <form onSubmit={handleCompleteReset} className="space-y-4">
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  name="new-password"
                  autoComplete="new-password"
                  placeholder="New Password (8+ characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-[#252936] border border-white/5 px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm w-full pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer select-none focus:outline-none"
                >
                  {showNewPass ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.05 10.05 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-[#7c4dff]/30 cursor-pointer text-sm"
              >
                {isAuthLoading ? 'Updating...' : 'Reset Password'}
              </button>
            </form>

            <p onClick={() => setView('login')} className="text-center text-sm text-slate-400 hover:text-white cursor-pointer mt-6">
              Cancel &amp; Return to Login
            </p>
          </div>
        )}

      </div>
    </div>
  );
};