import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive,
  Search,
  Plus,
  Upload,
  FileText,
  FileSpreadsheet,
  Video,
  Music,
  File,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Eye,
  Copy,
  Check,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

const USERS = [
  { id: 'ada', name: 'Ada Lovelace', badge: 'AL', bg: 'bg-purple-600' },
  { id: 'alan', name: 'Alan Turing', badge: 'AT', bg: 'bg-blue-600' },
  { id: 'guest', name: 'Guest', badge: 'GD', bg: 'bg-emerald-600' },
];

export default function App() {
  // 1. Multi-Tenant State
  const [currentUser, setCurrentUser] = useState(USERS[0]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // 2. Drive & File State
  const [files, setFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [optimisticFile, setOptimisticFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [bannerNotice, setBannerNotice] = useState(null);
  const [uploadErrorPopup, setUploadErrorPopup] = useState(false);

  function triggerUploadError() {
    setUploadErrorPopup(true);
  }

  // 3. Quick Note Modal State
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState('');

  // 4. AI Assistant Chat State
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Ask a question regarding files in your workspace.',
      sources: [],
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);

  // 5. File Preview Modal State
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    file: null,
    loading: false,
    data: null,
    error: null,
  });
  const [copiedPreview, setCopiedPreview] = useState(false);

  async function openFilePreview(file) {
    if (!file) return;
    setPreviewModal({
      isOpen: true,
      file,
      loading: true,
      data: null,
      error: null,
    });
    setCopiedPreview(false);

    try {
      const res = await fetch(
        `${API_BASE}/files/preview?filename=${encodeURIComponent(file.filename)}&userId=${encodeURIComponent(file.user_id || currentUser.id)}`
      );
      if (!res.ok) {
        throw new Error('No preview content found for this file.');
      }
      const data = await res.json();
      setPreviewModal({
        isOpen: true,
        file,
        loading: false,
        data,
        error: null,
      });
    } catch (err) {
      setPreviewModal({
        isOpen: true,
        file,
        loading: false,
        data: null,
        error: err.message || 'Failed to load preview.',
      });
    }
  }

  function closeFilePreview() {
    setPreviewModal({
      isOpen: false,
      file: null,
      loading: false,
      data: null,
      error: null,
    });
    setCopiedPreview(false);
  }

  function handleCopyPreview() {
    if (!previewModal.data?.content) return;
    navigator.clipboard.writeText(previewModal.data.content);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2000);
  }

  function getFileTypeBadge(filename = '') {
    const name = filename.toLowerCase();
    if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a')) {
      return { label: 'Audio Transcript', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    if (name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm')) {
      return { label: 'Video Transcript', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      return { label: 'Spreadsheet Records', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
    if (name.endsWith('.pdf') || name.endsWith('.docx')) {
      return { label: 'Extracted Document', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
    if (name.startsWith('note:')) {
      return { label: 'Knowledge Note', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
    return { label: 'Text Document', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
  }

  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);
  const userDropdownRef = useRef(null);

  // Close user dropdown when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setShowUserDropdown(false);
      }
    }

    if (showUserDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showUserDropdown]);

  // Close preview modal on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeFilePreview();
      }
    }
    if (previewModal.isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewModal.isOpen]);

  // Fetch Drive Files when User Changes
  useEffect(() => {
    fetchDriveFiles(currentUser.id);
    setMessages([
      {
        role: 'assistant',
        text: 'Ask a question regarding files in your workspace.',
        sources: [],
      },
    ]);
  }, [currentUser]);

  async function fetchDriveFiles(userId, isSilent = false) {
    if (!isSilent) setIsLoadingFiles(true);
    try {
      const res = await fetch(`${API_BASE}/files?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (err) {
      console.error('Failed to load drive files:', err);
    } finally {
      if (!isSilent) setIsLoadingFiles(false);
    }
  }

  // Poll Background Ingestion Job Status
  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${activeJobId}`);
        const job = await res.json();

        if (job.status === 'completed') {
          setBannerNotice({
            type: 'success',
            text: `Indexed "${job.filename}" (${job.chunks_created} vector chunks stored in your drive).`,
          });
          setActiveJobId(null);
          setOptimisticFile(null);
          fetchDriveFiles(currentUser.id, true);
          setTimeout(() => setBannerNotice(null), 4000);
        } else if (job.status === 'failed') {
          setActiveJobId(null);
          setOptimisticFile(null);
          fetchDriveFiles(currentUser.id, true);
          triggerUploadError();
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobId, currentUser]);

  // Scroll Chat to Bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuerying]);

  // Upload File with Tenant Isolation
  async function handleFileUpload(fileToUpload) {
    if (!fileToUpload) return;

    // Optimistically insert file as dimmed loading row in the table
    setOptimisticFile({
      id: `opt-${Date.now()}`,
      filename: fileToUpload.name,
      status: 'processing',
      user_id: currentUser.id,
      chunks_created: 0,
      created_at: new Date().toISOString(),
    });

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('userId', currentUser.id);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.status === 202) {
        setActiveJobId(data.jobId);
        await fetchDriveFiles(currentUser.id, true);
        setOptimisticFile(null);
      } else {
        setOptimisticFile(null);
        triggerUploadError();
      }
    } catch (err) {
      setOptimisticFile(null);
      triggerUploadError();
    }
  }

  // Save Quick Text Note
  async function handleSaveNote(e) {
    e.preventDefault();
    if (!noteContent.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: noteContent,
          metadata: { category: noteCategory || 'General Note' },
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        setBannerNotice({
          type: 'success',
          text: `Note stored in your drive.`,
        });
        setNoteContent('');
        setNoteCategory('');
        setShowNoteModal(false);
        fetchDriveFiles(currentUser.id);
      }
    } catch (err) {
      setBannerNotice({ type: 'error', text: 'Failed to save note.' });
    }
  }

  // Ask Question Scoped to Current Tenant
  async function handleAskQuestion(e) {
    e.preventDefault();
    if (!inputQuestion.trim() || isQuerying) return;

    const userText = inputQuestion;
    setInputQuestion('');
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setIsQuerying(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userText, userId: currentUser.id }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.answer,
            sources: data.sources || [],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `Error: ${data.error || 'Failed to generate answer.'}`,
            sources: [],
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Server unreachable.', sources: [] },
      ]);
    } finally {
      setIsQuerying(false);
    }
  }

  // File Icons Helper
  function getFileIcon(filename = '') {
    const name = filename.toLowerCase();
    if (name.endsWith('.pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    if (name.endsWith('.docx') || name.endsWith('.txt')) return <FileText className="h-5 w-5 text-blue-500" />;
    if (name.endsWith('.xlsx') || name.endsWith('.csv')) return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
    if (name.endsWith('.mp4') || name.endsWith('.mov')) return <Video className="h-5 w-5 text-purple-500" />;
    if (name.endsWith('.mp3') || name.endsWith('.wav')) return <Music className="h-5 w-5 text-amber-500" />;
    return <File className="h-5 w-5 text-slate-400" />;
  }

  const displayFiles = optimisticFile
    ? [optimisticFile, ...files.filter((f) => f.filename !== optimisticFile.filename)]
    : files;

  const filteredFiles = displayFiles.filter((f) =>
    f.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50 text-slate-900 font-sans">

      {/* ================= 1. TOP NAVBAR ================= */}
      <header className="relative z-50 h-14 w-full flex-shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 flex items-center justify-between">

        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <HardDrive className="h-4 w-4" />
          </div>
          <span className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
            KnowledgeDrive
          </span>
        </div>

        {/* Right Section: Badges & Switcher */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* User Switcher Dropdown */}
          <div className="relative" ref={userDropdownRef}>
            <button
              type="button"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-medium text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer"
            >
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-white text-[10px] font-bold ${currentUser.bg}`}>
                {currentUser.badge}
              </div>
              <span className="max-w-[100px] truncate sm:max-w-none">{currentUser.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {showUserDropdown && (
              <div className="absolute right-0 top-11 z-[60] w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in duration-150">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Switch Workspace
                </div>
                {USERS.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setCurrentUser(user);
                      setShowUserDropdown(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition cursor-pointer ${currentUser.id === user.id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full text-white text-[10px] font-bold ${user.bg}`}>
                      {user.badge}
                    </div>
                    <span className="font-medium text-slate-900">{user.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ================= 2. MAIN WORKSPACE ================= */}
      <div className="relative flex flex-1 overflow-hidden">

        {/* ================= CENTER: DRIVE CANVAS ================= */}
        <main
          className="flex flex-1 flex-col overflow-hidden bg-slate-50"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
          }}
        >
          {/* Action Header Row - Exactly aligned with Drive Assistant header */}
          <div className="flex h-14 flex-shrink-0 items-center justify-between px-4 sm:px-6 lg:px-8 bg-slate-50">
            <div className="flex items-center gap-3">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                Your Drive
              </h1>
              <span className="text-xs font-medium text-slate-500">
                {isLoadingFiles ? (
                  <span className="inline-block h-3 w-10 rounded bg-slate-200 animate-pulse align-middle" />
                ) : files.length === 0 ? (
                  '0 files'
                ) : (
                  `${files.length} ${files.length === 1 ? 'file' : 'files'}`
                )}
              </span>
            </div>

            {/* Action Bar (Search + Buttons) */}
            <div className="flex items-center gap-2 sm:gap-2.5">

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search in drive..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-40 sm:w-52 md:w-60 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>

              {/* New Note Button */}
              <button
                type="button"
                onClick={() => setShowNoteModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer"
              >
                <Plus className="h-4 w-4 text-slate-500" />
                <span>New Note</span>
              </button>

              {/* Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer"
              >
                <Upload className="h-4 w-4 text-slate-500" />
                <span>Upload</span>
              </button>

              {/* AI Assistant Toggle Button */}
              <button
                type="button"
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition cursor-pointer ${isChatOpen
                  ? 'border border-blue-600 bg-blue-50 text-blue-600 shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs'
                  }`}
              >
                <span>AI Assistant</span>
              </button>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.txt,.docx,.csv,.xlsx,.xls,.mp3,.wav,.m4a,.mp4"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 sm:p-6">

            {/* System Notification Banner (Success only, non-intrusive) */}
            {bannerNotice && bannerNotice.type === 'success' && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 mb-4 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">{bannerNotice.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBannerNotice(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Main Card Container */}
            <div className={`flex flex-1 flex-col min-h-0 overflow-hidden rounded-xl border bg-white shadow-xs transition ${isDragging ? 'border-2 border-dashed border-blue-500 bg-blue-50/50' : 'border-slate-200'
              }`}>
              {isLoadingFiles ? (
                // ================= SKELETON LOADING STATE =================
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="sticky top-0 border-b border-slate-200 bg-slate-50/95 backdrop-blur-xs text-slate-500 font-medium">
                      <tr>
                        <th className="px-4 sm:px-6 py-3">Name</th>
                        <th className="px-4 sm:px-6 py-3 hidden md:table-cell">Owner</th>
                        <th className="px-4 sm:px-6 py-3">Status</th>
                        <th className="px-4 sm:px-6 py-3 hidden sm:table-cell">Date Added</th>
                        <th className="px-4 sm:px-6 py-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[1, 2, 3].map((i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="px-4 sm:px-6 py-3.5 flex items-center gap-3">
                            <div className="h-5 w-5 rounded bg-slate-200" />
                            <div className="h-3.5 w-36 sm:w-48 rounded bg-slate-200" />
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 hidden md:table-cell">
                            <div className="h-3.5 w-8 rounded bg-slate-200" />
                          </td>
                          <td className="px-4 sm:px-6 py-3.5">
                            <div className="h-5 w-16 rounded-full bg-slate-200" />
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 hidden sm:table-cell">
                            <div className="h-3.5 w-20 rounded bg-slate-200" />
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 text-right">
                            <div className="inline-block h-6 w-14 rounded bg-slate-200" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : filteredFiles.length === 0 ? (
                // ================= EMPTY STATE =================
                <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-8 text-center">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">
                    No files in your drive
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm">
                    Upload documents, spreadsheets, audio or videos to create your knoweldge base.
                  </p>

                  {/* Vector Illustration */}
                  <div className="my-5">
                    <svg width="240" height="130" viewBox="0 0 280 180" fill="none" className="max-w-full drop-shadow-xs">
                      <rect x="50" y="30" width="180" height="110" rx="8" fill="#1E293B" stroke="#0F172A" strokeWidth="4" />
                      <rect x="58" y="38" width="164" height="94" rx="4" fill="#FFFFFF" />
                      <path d="M20 142C20 140.895 20.8954 140 22 140H258C259.105 140 260 140.895 260 142V146C260 148.209 258.209 150 256 150H24C21.7909 150 20 148.209 20 146V142Z" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="2" />
                      <rect x="75" y="52" width="130" height="66" rx="4" stroke="#94A3B8" strokeDasharray="4 4" strokeWidth="1.5" />
                      <circle cx="85" cy="40" r="14" fill="#E2E8F0" />
                      <rect x="180" y="35" width="28" height="36" rx="3" fill="#93C5FD" opacity="0.8" />
                      <polygon points="45,95 40,115 55,105" fill="#60A5FA" />
                      <rect x="35" y="85" width="22" height="18" rx="2" fill="#60A5FA" />
                      <polygon points="42,91 42,97 48,94" fill="#FFFFFF" />
                      <path d="M125 90L140 75L155 90" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="140" y1="78" x2="140" y2="105" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                  >
                    Select File to Upload
                  </button>
                </div>
              ) : (
                // ================= FILE TABLE =================
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-xs text-slate-500 font-medium">
                      <tr>
                        <th className="px-4 sm:px-6 py-3">Name</th>
                        <th className="px-4 sm:px-6 py-3 hidden md:table-cell">Owner</th>
                        <th className="px-4 sm:px-6 py-3">Status</th>
                        <th className="px-4 sm:px-6 py-3 hidden sm:table-cell">Date Added</th>
                        <th className="px-4 sm:px-6 py-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredFiles.map((file) => (
                        <tr
                          key={file.id}
                          onClick={() => file.status === 'completed' && openFilePreview(file)}
                          className={`group transition ${file.status === 'processing'
                            ? 'bg-slate-50/80 opacity-60 animate-pulse cursor-wait'
                            : file.status === 'completed'
                              ? 'hover:bg-slate-50/90 cursor-pointer'
                              : 'hover:bg-slate-50/80'
                            }`}
                        >
                          <td className="px-4 sm:px-6 py-3.5 flex items-center gap-3 font-medium text-slate-900">
                            {getFileIcon(file.filename)}
                            <span className="truncate max-w-[180px] sm:max-w-xs">{file.filename}</span>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 text-slate-600 hidden md:table-cell">
                            {file.user_id === currentUser.id ? 'You' : (USERS.find((u) => u.id === file.user_id)?.name || 'You')}
                          </td>
                          <td className="px-4 sm:px-6 py-3.5">
                            {file.status === 'processing' ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
                                Indexing...
                              </span>
                            ) : file.status === 'completed' ? (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                failed
                              </span>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 text-slate-400 hidden sm:table-cell">
                            {new Date(file.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 text-right">
                            {file.status === 'completed' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openFilePreview(file);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-2xs opacity-80 sm:opacity-0 group-hover:opacity-100 hover:border-slate-300 hover:text-blue-600 transition cursor-pointer"
                                title="Preview content"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span className="hidden md:inline">Preview</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ================= 3. MOBILE BACKDROP ================= */}
        {isChatOpen && (
          <div
            onClick={() => setIsChatOpen(false)}
            className="fixed inset-0 top-14 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden cursor-pointer"
          />
        )}

        {/* ================= 4. GEMINI CHAT DRAWER ================= */}
        {isChatOpen && (
          <aside className="fixed top-14 bottom-0 right-0 z-40 flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl sm:w-96 lg:static lg:h-full lg:w-96 lg:flex-shrink-0 lg:shadow-none transition-all">

            {/* Drawer Header */}
            <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <span className="text-sm font-semibold text-slate-900">
                Drive Assistant
              </span>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Conversation Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col gap-1 max-w-[88%] ${msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                    }`}
                >
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-slate-100 text-slate-800 rounded-bl-xs'
                      }`}
                  >
                    {msg.text}
                  </div>

                  {/* Sources Tag Chips */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {msg.sources.map((src, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
                        >
                          📎 {src}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isQuerying && (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  <span>Searching your files...</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleAskQuestion} className="flex-shrink-0 border-t border-slate-200 p-3 flex gap-2">
              <input
                type="text"
                placeholder="Type your question here..."
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
              />
              <button
                type="submit"
                disabled={isQuerying}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* ================= 5. QUICK NOTE MODAL ================= */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Add Note to Drive
              </h3>
              <button
                type="button"
                onClick={() => setShowNoteModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="mt-4 flex flex-col gap-3.5">
              <textarea
                rows="4"
                placeholder="Type your private notes here..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
              />
              <input
                type="text"
                placeholder="Category tag (e.g. Policy, WiFi, Memo)"
                value={noteCategory}
                onChange={(e) => setNoteCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                >
                  Save to Drive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 6. UPLOAD ERROR POPUP MODAL (CENTERED, NON-RED) ================= */}
      {uploadErrorPopup && (
        <div
          onClick={() => setUploadErrorPopup(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl text-center relative"
          >
            <button
              type="button"
              onClick={() => setUploadErrorPopup(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 mb-3">
              <AlertCircle className="h-5 w-5" />
            </div>

            <h3 className="text-base font-bold text-slate-900">Upload failed</h3>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 leading-relaxed">
              Please try again after some time.
            </p>

            <button
              type="button"
              onClick={() => setUploadErrorPopup(false)}
              className="mt-5 w-full rounded-lg bg-slate-900 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition cursor-pointer"
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {/* ================= 7. FILE PREVIEW MODAL ================= */}
      {previewModal.isOpen && (
        <div
          onClick={closeFilePreview}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col w-full max-w-2xl max-h-[85vh] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/70">
              <div className="flex items-center gap-2.5 min-w-0 mr-3">
                {previewModal.file && getFileIcon(previewModal.file.filename)}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 truncate max-w-xs sm:max-w-md">
                      {previewModal.file?.filename}
                    </h3>
                    {previewModal.file && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${getFileTypeBadge(previewModal.file.filename).bg}`}>
                        {getFileTypeBadge(previewModal.file.filename).label}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {previewModal.data?.content && (
                  <button
                    type="button"
                    onClick={handleCopyPreview}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer"
                    title="Copy indexed text"
                  >
                    {copiedPreview ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeFilePreview}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body / Viewer */}
            <div className="flex-1 overflow-y-auto p-5">
              {previewModal.loading ? (
                <div className="space-y-3 py-6">
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mb-4">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span>Loading preview...</span>
                  </div>
                  <div className="h-4 w-5/6 rounded bg-slate-100 animate-pulse" />
                  <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
                  <div className="h-4 w-4/6 rounded bg-slate-100 animate-pulse" />
                  <div className="h-4 w-3/4 rounded bg-slate-100 animate-pulse" />
                </div>
              ) : previewModal.error ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <AlertCircle className="h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-700">{previewModal.error}</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Content might still be processing, or this file may not contain extractable text.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 font-mono text-xs sm:text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap select-text">
                  {previewModal.data?.content}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              <button
                type="button"
                onClick={closeFilePreview}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}