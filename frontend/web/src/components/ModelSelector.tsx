import { ChevronDown, Check } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import styles from '../styles/ModelSelector.module.css';

export function ModelSelector() {
  const { settings, setCurrentModel, availableModels } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);

  const currentModel = settings.model;

  return (
    <div className={styles.modelSelector}>
      <button 
        className={styles.selectorButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select model"
        aria-expanded={isOpen}
      >
        <span className={styles.modelIcon}>🤖</span>
        <span className={styles.modelName}>{currentModel}</span>
        <ChevronDown size={16} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsOpen(false)} />
          <div className={styles.dropdown}>
            <div className={styles.dropdownHeader}>
              <span className={styles.dropdownTitle}>Select Model</span>
            </div>
            <div className={styles.dropdownContent}>
              {availableModels.map(model => (
                <button
                  key={model}
                  className={`${styles.dropdownItem} ${model === currentModel ? styles.selected : ''}`}
                  onClick={() => {
                    setCurrentModel(model);
                    setIsOpen(false);
                  }}
                >
                  <span className={styles.itemName}>{model}</span>
                  {model === currentModel && (
                    <Check size={16} className={styles.checkIcon} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
