import { AlertTriangle, CheckCircle, XCircle, Shield } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { PermissionModalRequest } from '../types';
import styles from '../styles/PermissionModal.module.css';

export function PermissionModal() {
  const { activeModal, sendPermissionResponse, respondToModal } = useAppStore();
  
  if (!activeModal || activeModal.kind !== 'permission') {
    return null;
  }
  
  const modal = activeModal as PermissionModalRequest;
  
  const handleApprove = () => {
    if (sendPermissionResponse) {
      sendPermissionResponse(modal.request_id, true);
    }
    respondToModal(modal.request_id, true);
  };
  
  const handleDeny = () => {
    if (sendPermissionResponse) {
      sendPermissionResponse(modal.request_id, false);
    }
    respondToModal(modal.request_id, false);
  };
  
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContainer}>
        <div className={styles.modalHeader}>
          <Shield size={24} className={styles.icon} />
          <h2>Permission Request</h2>
        </div>
        
        <div className={styles.modalContent}>
          <div className={styles.toolInfo}>
            <span className={styles.toolLabel}>Tool:</span>
            <span className={styles.toolName}>{modal.tool_name}</span>
          </div>
          
          <div className={styles.reasonBox}>
            <AlertTriangle size={16} className={styles.warningIcon} />
            <p className={styles.reason}>{modal.reason}</p>
          </div>
        </div>
        
        <div className={styles.modalActions}>
          <button 
            className={`${styles.button} ${styles.approveButton}`}
            onClick={handleApprove}
          >
            <CheckCircle size={18} />
            Approve
          </button>
          <button 
            className={`${styles.button} ${styles.denyButton}`}
            onClick={handleDeny}
          >
            <XCircle size={18} />
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}