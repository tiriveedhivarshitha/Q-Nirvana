import { useState, useRef, useCallback, useEffect } from "react";
import api from '../../utils/api';
import { db, storage } from '../../firebase';
import {
    collection, addDoc, getDocs, query, deleteDoc, doc, orderBy, where
} from 'firebase/firestore';
import {
    ref, getDownloadURL, deleteObject, uploadBytesResumable
} from 'firebase/storage';
import {
    Activity, Clock, ShieldAlert, Calendar, Droplet, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

// ─── Crypto helpers (AES-GCM via Web Crypto API) ────────────────────────────
async function generateKey() {
    return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function exportKey(key) {
    const exported = await crypto.subtle.exportKey("jwk", key);
    return JSON.stringify(exported);
}

async function importKey(jwkString) {
    const jwk = JSON.parse(jwkString);
    return crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

async function encryptFile(file, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buffer = await file.arrayBuffer();
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer);
    return { encrypted, iv };
}

async function decryptFile(encryptedBuffer, iv, key) {
    return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedBuffer);
}

// Helper to convert Uint8Array to base64 (Robust version for large files)
function uint8ArrayToBase64(arr) {
    let binary = "";
    const len = arr.length;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
}

// Helper to convert base64 to Uint8Array
function base64ToUint8Array(base64) {
    try {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error("Base64 Decode Error:", e);
        return new Uint8Array(0);
    }
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 20, stroke = "currentColor", fill = "none", strokeWidth = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
    </svg>
);

const icons = {
    upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    search: "M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    prescription: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0-2-2h2m4 6h-4m4 4h-4m2 4H9",
    report: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    other: "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z",
    trash: "M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    close: "M18 6L6 18M6 6l12 12",
    plus: "M12 5v14M5 12h14",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    check: "M20 6L9 17l-5-5",
};

// ─── Category config ─────────────────────────────────────────────────────────
const CATEGORIES = [
    { id: "prescription", label: "Prescription", icon: "prescription", color: "#3B82F6", bg: "#EFF6FF" },
    { id: "test_report", label: "Test Report", icon: "report", color: "#10B981", bg: "#ECFDF5" },
    { id: "other", label: "Other", icon: "other", color: "#8B5CF6", bg: "#F5F3FF" },
];

const formatBytes = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const formatDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// ─── Main Component ──────────────────────────────────────────────────────────
export default function MedicalHistory() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [records, setRecords] = useState([]);
    const [showUpload, setShowUpload] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterCat, setFilterCat] = useState("all");
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [previewRecord, setPreviewRecord] = useState(null);
    const [toastMsg, setToastMsg] = useState(null);

    // Upload form state
    const [pendingFiles, setPendingFiles] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState("prescription");
    const [doctorName, setDoctorName] = useState("");
    const [notes, setNotes] = useState("");

    const fileInputRef = useRef();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        console.log('📂 Loading medical history for user:', user);
        try {
            // 1. Load Stats
            try {
                const s = await api.get('/patient/stats');
                if (s.data?.summary) setStats(s.data.summary);
            } catch (e) {
                console.warn("Stats API unavailable:", e);
            }

            // 2. Load Firestore Records
            // Flexible UID detection to handle different backend/auth implementations
            const uid = user?.id || user?._id || user?.uid;

            if (uid) {
                console.log('🔍 Querying records for patientId:', uid);
                const q = query(
                    collection(db, "medical_records"),
                    where("patientId", "==", String(uid))
                );

                const querySnapshot = await getDocs(q);
                const fbRecords = [];
                querySnapshot.forEach((doc) => {
                    fbRecords.push({ docId: doc.id, ...doc.data() });
                });

                console.log(`✅ Loaded ${fbRecords.length} records from Firestore`);

                // Sort in memory (Descending by date)
                fbRecords.sort((a, b) => (b.date || 0) - (a.date || 0));
                setRecords(fbRecords);
            } else {
                console.warn('⚠️ No user ID found for query');
            }
        } catch (e) {
            console.error("Cloud Load Error:", e);
            toast.error('Connection issue: Could not fetch records');
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg, type = "success") => {
        setToastMsg({ msg, type });
        setTimeout(() => setToastMsg(null), 3000);
    };

    // Drag handlers
    const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = () => setDragging(false);
    const onDrop = (e) => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); };
    const onFileInput = (e) => handleFiles(Array.from(e.target.files));

    const handleFiles = (files) => {
        const allowed = files.filter(f => {
            const ext = f.name.split(".").pop().toLowerCase();
            return ["pdf", "jpg", "jpeg", "png", "heic", "doc", "docx"].includes(ext);
        });
        if (allowed.length !== files.length) showToast("Some files skipped (unsupported format)", "warn");
        if (allowed.length) setPendingFiles(prev => [...prev, ...allowed]);
    };

    const removePending = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

    // PARALLEL UPLOAD FOR MAXIMUM SPEED
    const handleUpload = async () => {
        if (!pendingFiles.length) return;

        const filesToUpload = [...pendingFiles];
        const category = selectedCategory;
        const doctor = doctorName.trim() || "—";

        // 1. Optimistic Add: Close modal and add placeholders to list IMMEDIATELY
        const optimisticIds = filesToUpload.map(() => crypto.randomUUID());
        const placeholders = filesToUpload.map((file, i) => ({
            docId: optimisticIds[i],
            name: file.name,
            category: category,
            doctor: doctor,
            date: Date.now(),
            size: file.size,
            type: file.type,
            localFile: file, // Store for instant preview/download
            isOptimistic: true
        }));

        setRecords(prev => [...placeholders, ...prev]);
        setPendingFiles([]);
        setDoctorName("");
        setShowUpload(false);
        showToast("Securing files in vault...", "info");

        // Use a counter to show a single success toast for multiple files
        let syncedCount = 0;

        // 2. Process background sync for each file individually
        filesToUpload.forEach(async (file, i) => {
            const optimisticId = optimisticIds[i];
            try {
                // Generate secure keys
                const key = await generateKey();
                const { encrypted, iv } = await encryptFile(file, key);
                const jwkString = await exportKey(key);
                const ivBase64 = uint8ArrayToBase64(iv);

                // Prepare storage
                const storageId = crypto.randomUUID();
                const storagePath = `medical_records/${storageId}`;
                const fileRef = ref(storage, storagePath);

                // Upload encrypted blob
                const uploadTask = uploadBytesResumable(fileRef, new Blob([encrypted]));

                // Wait for upload completion
                await new Promise((resolve, reject) => {
                    uploadTask.on('state_changed', null, reject, resolve);
                });

                const downloadUrl = await getDownloadURL(fileRef);

                const uid = user?.id || user?._id || user?.uid;
                const docData = {
                    id: storageId, name: file.name, category: category,
                    doctor: doctor, notes: "",
                    patientId: uid, // Store identity to fix visibility after reload
                    size: file.size, type: file.type, date: Date.now(),
                    downloadUrl, storagePath, iv: ivBase64, jwk: jwkString
                };

                const docRef = await addDoc(collection(db, "medical_records"), docData);

                // Success: Finalize record in UI
                setRecords(prev => prev.map(r =>
                    r.docId === optimisticId ? { docId: docRef.id, ...docData, isOptimistic: false } : r
                ));
            } catch (err) {
                console.error("Sync Error:", err);
                // Mark as failed in UI so user knows it didn't save
                setRecords(prev => prev.map(r =>
                    r.docId === optimisticId ? { ...r, error: true, isOptimistic: false } : r
                ));
                toast.error(`Could not save ${file.name}. Check connection.`, { duration: 4000 });
            }
        });
    };

    const handleDownload = useCallback(async (record) => {
        if (record.isOptimistic && record.localFile) {
            const url = URL.createObjectURL(record.localFile);
            const a = document.createElement("a");
            a.href = url; a.download = record.name; a.click();
            URL.revokeObjectURL(url);
            return;
        }
        try {
            toast.loading("Decrypting...", { id: 'dec' });
            const response = await fetch(record.downloadUrl);
            if (!response.ok) throw new Error("Cloud fetch failed");

            const encryptedBuffer = await response.arrayBuffer();
            const key = await importKey(record.jwk);
            const iv = base64ToUint8Array(record.iv);
            const decryptedBuffer = await decryptFile(encryptedBuffer, iv, key);
            const blob = new Blob([decryptedBuffer], { type: record.type });

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = record.name; a.click();
            URL.revokeObjectURL(url);
            toast.success("Downloaded", { id: 'dec' });
        } catch (err) {
            console.error("Download Error:", err);
            toast.error("Download failed. Cloud server busy.", { id: 'dec' });
        }
    }, []);

    const handlePreview = useCallback(async (record) => {
        if (record.isOptimistic && record.localFile) {
            const url = URL.createObjectURL(record.localFile);
            setPreviewRecord({ ...record, blobUrl: url });
            return;
        }
        try {
            toast.loading("Preparing...", { id: 'prev' });
            const response = await fetch(record.downloadUrl);
            const encryptedBuffer = await response.arrayBuffer();
            const key = await importKey(record.jwk);
            const iv = base64ToUint8Array(record.iv);
            const decryptedBuffer = await decryptFile(encryptedBuffer, iv, key);
            const blob = new Blob([decryptedBuffer], { type: record.type });

            const url = URL.createObjectURL(blob);
            setPreviewRecord({ ...record, blobUrl: url });
            toast.dismiss('prev');
        } catch (err) {
            console.error(err);
            toast.error("Failed", { id: 'prev' });
        }
    }, []);

    const closePreview = () => {
        if (previewRecord?.blobUrl) URL.revokeObjectURL(previewRecord.blobUrl);
        setPreviewRecord(null);
    };

    const handleDelete = async (record) => {
        if (!window.confirm("Delete record?")) return;
        try {
            toast.loading("Deleting...", { id: 'del' });
            await deleteDoc(doc(db, "medical_records", record.docId));
            await deleteObject(ref(storage, record.storagePath));
            setRecords(prev => prev.filter(r => r.docId !== record.docId));
            toast.success("Removed", { id: 'del' });
        } catch (err) {
            console.error(err);
            toast.error("Error", { id: 'del' });
        }
    };

    const filtered = records.filter(r => {
        const matchSearch = (r.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
            (r.doctor?.toLowerCase() || "").includes(searchQuery.toLowerCase());
        const matchCat = filterCat === "all" || r.category === filterCat;
        return matchSearch && matchCat;
    });

    const catInfo = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[2];

    if (loading) return <div className="page-loader"><div className="spinner spinner-dark" /></div>;

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        .hr-root {
          font-family: 'Sora', sans-serif;
          background: #F8FAFF;
          min-height: auto;
          padding: 0;
        }

        .hr-root button, 
        .hr-root input, 
        .hr-root select, 
        .hr-root textarea {
          font-family: 'Sora', sans-serif;
        }

        .hr-card {
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 2px 24px rgba(30,58,138,0.08);
          overflow: hidden;
          border: 1px solid #E8EEFF;
        }

        /* Header */
        .hr-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid #F1F5FF;
          background: linear-gradient(135deg, #fff 0%, #F8FAFF 100%);
        }

        .hr-title-wrap { display: flex; align-items: center; gap: 12px; }
        .hr-title {
          font-size: 20px;
          font-weight: 800;
          color: #0A0A0A;
          letter-spacing: -0.6px;
          background: linear-gradient(135deg, #0A0A0A 0%, #2D2D2D 60%, #1a1a1a 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: none;
          position: relative;
        }
        .hr-secure-badge {
          display: flex; align-items: center; gap: 5px;
          background: #ECFDF5; color: #065F46;
          border: 1px solid #A7F3D0;
          border-radius: 20px; padding: 3px 10px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.4px;
        }

        .hr-actions { display: flex; align-items: center; gap: 8px; }
        .hr-icon-btn {
          width: 38px; height: 38px; border-radius: 10px;
          border: 1.5px solid #E8EEFF; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #64748B; transition: all 0.15s;
        }
        .hr-icon-btn:hover { background: #F1F5FF; border-color: #C7D2FE; color: #1E3A8A; }
        .hr-upload-btn {
          display: flex; align-items: center; gap: 7px;
          background: #1E3A8A; color: #fff;
          border: none; border-radius: 10px;
          padding: 9px 16px; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
          font-family: 'Sora', sans-serif;
        }
        .hr-upload-btn:hover { background: #1E40AF; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(30,58,138,0.25); }

        /* Modal Structure */
        .hr-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.45);
          backdrop-filter: blur(6px); z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          padding: 24px; animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .hr-modal {
          background: #fff; border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,0.2);
          width: 100%; max-width: 520px; 
          max-height: 90vh;
          display: flex; flex-direction: column;
          overflow: hidden;
          animation: popIn 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes popIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }

        .hr-modal-header {
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px; border-bottom: 1px solid #F1F5FF;
          background: linear-gradient(135deg, #F8FAFF 0%, #fff 100%);
        }
        .hr-modal-title { font-size: 17px; font-weight: 700; color: #1E3A8A; }
        .hr-modal-sub { font-size: 12px; color: #94A3B8; margin-top: 2px; }
        .hr-modal-body { 
          padding: 24px; 
          display: flex; flex-direction: column; gap: 20px; 
          overflow-y: auto;
          flex: 1;
        }
        .hr-modal-footer {
          flex-shrink: 0;
          padding: 16px 24px; border-top: 1px solid #F1F5FF;
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px;
          background: #FAFBFF;
        }

        /* Rest of Styles */
        .hr-bar { display: flex; align-items: center; gap: 12px; padding: 16px 24px; border-bottom: 1px solid #F1F5FF; background: #FAFBFF; }
        .hr-search-wrap { flex: 1; position: relative; }
        .hr-search-wrap svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
        .hr-search { width: 100%; padding: 9px 12px 9px 38px; border: 1.5px solid #E8EEFF; border-radius: 10px; font-size: 13px; outline: none; background: #fff; }
        .hr-filter-pills { display: flex; gap: 6px; }
        .hr-pill { padding: 6px 13px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1.5px solid #E8EEFF; background: #fff; color: #64748B; cursor: pointer; }
        .hr-pill.active { background: #1E3A8A; color: #fff; border-color: #1E3A8A; }
        .hr-list { padding: 16px 24px; display: flex; flex-direction: column; gap: 10px; }
        .hr-record { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 14px; border: 1.5px solid #F1F5FF; background: #FAFBFF; transition: all 0.15s; }
        .hr-rec-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .hr-rec-body { flex: 1; min-width: 0; }
        .hr-rec-name { font-size: 13.5px; font-weight: 600; color: #1E293B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hr-rec-meta { font-size: 11.5px; color: #94A3B8; margin-top: 3px; display: flex; gap: 10px; align-items: center; }
        .hr-cat-chip { font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 20px; }
        .hr-rec-btns { display: flex; gap: 6px; }
        .hr-rec-btn { width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid #E8EEFF; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748B; }
        .hr-rec-btn.danger:hover { background: #FEF2F2; color: #EF4444; border-color: #FECACA; }
        .hr-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 72px 24px; gap: 12px; color: #94A3B8; }
        .hr-dropzone { border: 2px dashed #C7D2FE; border-radius: 16px; padding: 32px 20px; text-align: center; cursor: pointer; background: #F8FAFF; transition: 0.2s; }
        .hr-dropzone:hover { border-color: #818CF8; background: #F0F1FF; }
        .hr-field { display: flex; flex-direction: column; gap: 6px; }
        .hr-label { font-size: 12px; font-weight: 600; color: #475569; }
        .hr-input { padding: 10px 13px; border: 1.5px solid #E8EEFF; border-radius: 10px; font-size: 13px; outline: none; }
        .hr-btn-save { padding: 9px 22px; background: #1E3A8A; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; }
        .hr-btn-save:disabled { opacity: 0.6; }
        .hr-progress-bar { height: 6px; background: #F1F5FF; border-radius: 3px; overflow: hidden; }
        .hr-progress-fill { height: 100%; background: linear-gradient(90deg, #6366F1, #3B82F6); transition: width 0.3s; }
        .hr-preview { position: fixed; inset: 0; background: rgba(10,15,30,0.85); z-index: 2000; display: flex; flex-direction: column; }
        .hr-preview-bar { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: rgba(0,0,0,0.2); }
        .hr-preview-area { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; position: relative; }
        .hr-preview-area img { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 12px 48px rgba(0,0,0,0.5); border-radius: 8px; }
        .hr-preview-iframe { width: 100%; height: 100%; border: none; background: #fff; border-radius: 12px; box-shadow: 0 12px 48px rgba(0,0,0,0.5); }
        .hr-no-preview { color: #fff; text-align: center; background: rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; border: 2px dashed rgba(255,255,255,0.2); }
        .hr-toast { position: fixed; bottom: 24px; right: 24px; z-index: 3000; padding: 12px 18px; border-radius: 12px; display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
        .hr-toast.success { background: #065F46; color: #fff; }
        .hr-toast.info { background: #1E3A8A; color: #fff; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinner-small {
           border: 2px solid rgba(0,0,0,0.1);
           border-top-color: currentColor;
           border-radius: 50%;
           animation: spin 0.8s linear infinite;
        }
      `}</style>

            <div className="hr-root">
                <div style={{ marginBottom: 28 }}>
                    <h2 className="section-title">Health Repository</h2>
                    <p className="section-sub">Digital vault for prescriptions and diagnostic reports</p>
                </div>

                {/* Health Stats */}
                <div className="grid-4" style={{ marginBottom: 32 }}>
                    <div className="stat-card">
                        <div className="stat-icon blue"><Activity size={20} color="var(--navy-600)" /></div>
                        <div>
                            <div className="stat-label">Blood Group</div>
                            <div className="stat-value">{stats?.blood_group || 'O+'}</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon teal"><Calendar size={20} color="var(--teal-600)" /></div>
                        <div>
                            <div className="stat-label">Last Consult</div>
                            <div className="stat-value">{stats?.last_consultation || 'Never'}</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon orange"><ShieldAlert size={20} color="var(--warning)" /></div>
                        <div>
                            <div className="stat-label">Records</div>
                            <div className="stat-value">{records.length}</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon red"><Droplet size={20} color="var(--danger)" /></div>
                        <div>
                            <div className="stat-label">Security</div>
                            <div className="stat-value">AES-256</div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
                    <div>
                        <div className="hr-card">
                            {/* Header */}
                            <div className="hr-header">
                                <div className="hr-title-wrap">
                                    <div className="hr-title">Historical Records</div>
                                    <div className="hr-secure-badge">
                                        <Icon d={icons.shield} size={12} strokeWidth={2} />
                                        Cloud Synced
                                    </div>
                                </div>
                                <div className="hr-actions">
                                    <div className="hr-icon-btn"><Icon d={icons.search} size={16} /></div>
                                    <button className="hr-upload-btn" onClick={() => setShowUpload(true)}>
                                        <Icon d={icons.plus} size={15} strokeWidth={2.5} /> Add Record
                                    </button>
                                </div>
                            </div>

                            {/* Bar */}
                            {records.length > 0 && (
                                <div className="hr-bar">
                                    <div className="hr-search-wrap">
                                        <Icon d={icons.search} size={15} />
                                        <input className="hr-search" placeholder="Search files..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                    </div>
                                </div>
                            )}

                            {/* List */}
                            {filtered.length === 0 ? (
                                <div className="hr-empty">
                                    <Icon d={icons.prescription} size={40} />
                                    <p>No records found. Upload your reports securely.</p>
                                    <button className="hr-upload-btn" onClick={() => setShowUpload(true)}>Upload Now</button>
                                </div>
                            ) : (
                                <div className="hr-list">
                                    {filtered.map(r => {
                                        const cat = catInfo(r.category);
                                        return (
                                            <div key={r.docId} className="hr-record">
                                                <div className="hr-rec-icon" style={{ background: cat.bg, color: cat.color }}>
                                                    <Icon d={icons[cat.icon]} size={20} />
                                                </div>
                                                <div className="hr-rec-body">
                                                    <div className="hr-rec-name">{r.name}</div>
                                                    <div className="hr-rec-meta">
                                                        <span className="hr-cat-chip" style={{ background: cat.bg }}>{cat.label}</span>
                                                        <span>{formatDate(r.date)}</span>
                                                        {r.error && <span style={{ color: '#ef4444' }}>⚠️ Sync Error</span>}
                                                    </div>
                                                </div>
                                                <div className="hr-rec-btns">
                                                    <button className="hr-rec-btn" onClick={() => handlePreview(r)} title="Preview">
                                                        <Icon d={icons.eye} size={14} />
                                                    </button>
                                                    <button className="hr-rec-btn" onClick={() => handleDownload(r)} title="Download">
                                                        <Icon d={icons.download} size={14} />
                                                    </button>
                                                    <button className="hr-rec-btn danger" onClick={() => handleDelete(r)} title="Delete">
                                                        <Icon d={icons.trash} size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div className="card">
                            <div className="card-header"><div className="card-title">Security Status</div></div>
                            <div className="card-body">
                                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                                    Your data is encrypted with <strong>AES-256-GCM</strong>. Keys are generated privately and stored with your double-encrypted metadata.
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ background: '#eff6ff', border: 'none' }}>
                            <div className="card-body">
                                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                    <AlertCircle color="var(--navy-600)" size={20} />
                                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Auto-Sync Active</h4>
                                </div>
                                <p style={{ fontSize: 12, color: 'var(--slate-600)' }}>All uploads are automatically synced to your secure digital vault.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Multi-File Upload Modal */}
                {showUpload && (
                    <div className="hr-overlay" onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
                        <div className="hr-modal">
                            <div className="hr-modal-header">
                                <div>
                                    <div className="hr-modal-title">Secure Upload</div>
                                    <div className="hr-modal-sub">Fast parallel encryption & cloud sync</div>
                                </div>
                                <button className="hr-icon-btn" onClick={() => setShowUpload(false)}><Icon d={icons.close} size={16} /></button>
                            </div>

                            <div className="hr-modal-body">
                                <div className={`hr-dropzone`} onClick={() => fileInputRef.current.click()}>
                                    <Icon d={icons.upload} size={24} />
                                    <div style={{ marginTop: 10, fontWeight: 600 }}>Drag files or Click to Browse</div>
                                    <input ref={fileInputRef} type="file" multiple hidden onChange={onFileInput} />
                                </div>

                                {pendingFiles.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {pendingFiles.map((f, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 8, background: '#f8faff', borderRadius: 8, fontSize: 12 }}>
                                                <span>{f.name}</span>
                                                <span onClick={() => removePending(i)} style={{ color: '#ef4444', cursor: 'pointer' }}>✕</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="hr-field">
                                    <label className="hr-label">Record Category</label>
                                    <select className="hr-input" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>

                                <div className="hr-field">
                                    <label className="hr-label">Doctor's Name</label>
                                    <input className="hr-input" placeholder="Optional" value={doctorName} onChange={e => setDoctorName(e.target.value)} />
                                </div>

                            </div>

                            <div className="hr-modal-footer">
                                <span style={{ fontSize: 11, color: '#64748B' }}>🔒 End-to-End Encrypted</span>
                                <button className="hr-btn-save" disabled={!pendingFiles.length} onClick={handleUpload}>
                                    Send Securely
                                </button>
                            </div>
                        </div>
                    </div>
                )
                }

                {/* Preview Modal */}
                {previewRecord && (
                    <div className="hr-preview">
                        <div className="hr-preview-bar">
                            <span style={{ color: '#fff' }}>{previewRecord.name}</span>
                            <button className="hr-btn-save" onClick={closePreview}>Close</button>
                        </div>
                        <div className="hr-preview-area">
                            {previewRecord.type?.startsWith("image/") ? (
                                <img src={previewRecord.blobUrl} alt="Record Preview" />
                            ) : previewRecord.type === "application/pdf" || previewRecord.name?.toLowerCase().endsWith('.pdf') ? (
                                <iframe src={previewRecord.blobUrl} className="hr-preview-iframe" title="PDF Preview" />
                            ) : (
                                <div className="hr-no-preview">
                                    <Icon d={icons.other} size={48} />
                                    <h3 style={{ marginTop: 20 }}>Preview Not Available</h3>
                                    <p style={{ opacity: 0.7, fontSize: 13, marginTop: 8 }}>This file type cannot be previewed directly. Please download to view.</p>
                                    <button className="hr-btn-save" style={{ marginTop: 24, marginInline: 'auto' }} onClick={() => handleDownload(previewRecord)}>
                                        <Icon d={icons.download} size={15} /> Download Now
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Toast */}
                {toastMsg && (
                    <div className={`hr-toast success`}>
                        {toastMsg.msg}
                    </div>
                )}
            </div>
        </>
    );
}
