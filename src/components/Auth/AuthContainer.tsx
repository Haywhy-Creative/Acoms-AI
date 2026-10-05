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

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Handle Login & Signup
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      Swal.fire({ icon: 'error', title: 'Password Invalid', text: 'Password must be at least 8 characters long.', confirmButtonColor: '#7c4dff' });
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

      // Sync useAuth store and load user chat history namespace
      try {
  // 1. Fetch user's saved preferences (where your bucket image URL is stored)
  const prefs = await account.getPrefs();

  // 2. Sync useAuth store with session details and their custom avatar (falling back to default if none exists)
  useAuth.getState().setUser({
    id: session.$id,
    name: session.name,
    email: session.email,
    avatar: prefs?.avatar || "/imgs/default-avatar.jpg",
  });

  // 3. Load chat history namespace
  useChat.getState().loadUserHistory(session.$id);
  
} catch (error) {
  console.error("Failed to load user preferences or session state:", error);
  // Fallback default setup if preferences fail to fetch
  useAuth.getState().setUser({
    id: session.$id,
    name: session.name,
    email: session.email,
    avatar: "/imgs/default-avatar.jpg",
  });
  useChat.getState().loadUserHistory(session.$id);
}

      setView('chat');
      Swal.fire({ icon: 'success', title: view === 'login' ? 'Logged In!' : 'Account Created!', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Authentication Failed', text: err.message, confirmButtonColor: '#7c4dff' });
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Handle Recovery Email
  const handleSendRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    try {
      const redirectUrl = window.location.origin;
      await account.createRecovery(recoveryEmail, redirectUrl);
      Swal.fire({
        icon: 'success',
        title: 'Recovery Email Sent!',
        text: 'Check your email inbox for your secure password reset link.',
        confirmButtonColor: '#7c4dff',
      });
      setView('login');
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Request Failed', text: err.message, confirmButtonColor: '#7c4dff' });
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Handle Password Reset Complete
  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      Swal.fire({ icon: 'error', title: 'Password Invalid', text: 'Password must be at least 8 characters long.', confirmButtonColor: '#7c4dff' });
      return;
    }
    setIsAuthLoading(true);
    try {
      await account.updateRecovery(
        recoveryParams.userId,
        recoveryParams.secret,
        newPassword,
      );
      window.history.replaceState({}, document.title, window.location.pathname);
      Swal.fire({
        icon: 'success',
        title: 'Password Updated!',
        text: 'Your password has been successfully reset. Please log in.',
        confirmButtonColor: '#28a745',
      });
      setView('login');
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Reset Failed',
        text: 'The recovery link is invalid or has expired. Please request a new one.',
        confirmButtonColor: '#7c4dff',
      });
      setView('forgot-password');
    } finally {
      setIsAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0f111a] font-['Plus_Jakarta_Sans',sans-serif] text-white">
      {/* Landing Page View */}
      {view === 'landing' && (
        <div className="max-w-xl w-full text-center p-8 bg-[#1c1f2b]/80 border border-white/10 rounded-[32px] shadow-2xl backdrop-blur-xl">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            ACOMS AI Assistant
          </h1>
          <p className="text-slate-400 text-base md:text-lg mb-8 leading-relaxed">

 Built specifically for computer science students and software engineering workflows, ACOMS-AI goes beyond general chat like other AI models with secure workspace isolation, specialized narrow AI models, and intelligent code completions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setView('signup')}
              className="bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold py-3.5 px-8 rounded-2xl transition-all shadow-lg shadow-[#7c4dff]/30 cursor-pointer"
            >
              Get Started
            </button>
            <button
              onClick={() => setView('login')}
              className="bg-[#252936] hover:bg-[#2a2f3d] text-white font-semibold py-3.5 px-8 rounded-2xl border border-white/5 transition-all cursor-pointer"
            >
              Login
            </button>
          </div>
        </div>
      )}

      {/* Login & Signup Views */}
      {(view === 'login' || view === 'signup') && (
        <div className="w-full max-w-[420px] bg-[#1c1f2b]/90 p-8 rounded-[32px] border border-white/10 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              {view === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {view === 'login' ? 'Sign in to access your chat workspace' : 'Register to start exploring AI models'}
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
                    className="bg-[#252936] border border-white/5 px-4 py-3 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] focus:ring-2 focus:ring-[#7c4dff]/30 text-sm"
                  />
                  <input
                    type="text"
                    name="given-name"
                    autoComplete="given-name"
                    placeholder="First Name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="bg-[#252936] border border-white/5 px-4 py-3 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] focus:ring-2 focus:ring-[#7c4dff]/30 text-sm"
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
                  className="bg-[#252936] border border-white/5 px-4 py-3 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] focus:ring-2 focus:ring-[#7c4dff]/30 text-sm w-full"
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
              className="bg-[#252936] border border-white/5 px-4 py-3 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] focus:ring-2 focus:ring-[#7c4dff]/30 text-sm w-full"
            />

            {/* Password Input with Facebook-style Professional Eye Icon */}
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                name={view === 'signup' ? 'new-password' : 'current-password'}
                autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                placeholder="Password (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="bg-[#252936] border border-white/5 px-4 py-3 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] focus:ring-2 focus:ring-[#7c4dff]/30 text-sm w-full pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer select-none focus:outline-none"
                aria-label="Toggle password visibility"
              >
                {showPass ? (
                  // Eye Slash (Hide)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  // Eye Open (Show)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-[#252936] border border-white/5 px-4 py-3 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] focus:ring-2 focus:ring-[#7c4dff]/30 text-sm w-full pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer select-none focus:outline-none"
                  aria-label="Toggle confirm password visibility"
                >
                  {showConfirmPass ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-[#7c4dff]/30 cursor-pointer mt-2"
            >
              {isAuthLoading ? 'Please wait...' : view === 'login' ? 'Login' : 'Sign Up'}
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

          <p
            onClick={() => setView('landing')}
            className="text-center text-xs text-slate-500 hover:underline cursor-pointer mt-6"
          >
            ← Back to Home
          </p>
        </div>
      )}

      {/* Forgot Password View */}
      {view === 'forgot-password' && (
        <div className="w-full max-w-[420px] bg-[#1c1f2b]/90 p-8 rounded-[32px] border border-white/10 shadow-2xl backdrop-blur-xl">
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
              className="bg-[#252936] border border-white/5 px-4 py-3 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm w-full"
            />
            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-[#7c4dff]/30 cursor-pointer"
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
        <div className="w-full max-w-[420px] bg-[#1c1f2b]/90 p-8 rounded-[32px] border border-white/10 shadow-2xl backdrop-blur-xl">
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
                placeholder="New Password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="bg-[#252936] border border-white/5 px-4 py-3 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c4dff] text-sm w-full pr-12"
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer select-none focus:outline-none"
                aria-label="Toggle new password visibility"
              >
                {showNewPass ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full bg-[#7c4dff] hover:bg-[#9670ff] text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-[#7c4dff]/30 cursor-pointer"
            >
              {isAuthLoading ? 'Updating...' : 'Reset Password'}
            </button>
          </form>

          <p onClick={() => setView('login')} className="text-center text-sm text-slate-400 hover:text-white cursor-pointer mt-6">
            Cancel & Return to Login
          </p>
        </div>
      )}
    </div>
  );
};