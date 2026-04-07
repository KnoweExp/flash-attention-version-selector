# Flash Attention Installer - SPEC.md

## Concept & Vision

Une interface élégante et professionnelle pour générer la commande d'installation correcte de flash_attn. L'outil résout le casse-tête de compatibilité entre Python, CUDA, et PyTorch en guidant l'utilisateur à travers un流程 visuel clair. L'ambiance est celle d'un terminal moderne "hacker" — sombre, technique, mais intuitif.

## Design Language

### Aesthetic Direction
Style "cyberpunk terminal" — fond sombre avec accents néon, typographie monospace, effets de glow subtils. Inspiré des interfaces de monitoring système et des IDEs modernes.

### Color Palette
- **Primary**: #00D9FF (cyan néon)
- **Secondary**: #8B5CF6 (violet)
- **Accent**: #10B981 (vert succès)
- **Warning**: #F59E0B (orange)
- **Error**: #EF4444 (rouge)
- **Background**: #0F172A (bleu nuit profond)
- **Surface**: #1E293B (ardoise)
- **Text Primary**: #F1F5F9
- **Text Secondary**: #94A3B8

### Typography
- **Headings**: JetBrains Mono (monospace)
- **Body**: Inter
- **Code**: JetBrains Mono

### Spatial System
- Espacement base: 4px
- Padding cards: 24px
- Border radius: 12px
- Gap entre éléments: 16px

### Motion Philosophy
- Transitions douces 200-300ms ease-out
- Glow pulse subtil sur les éléments actifs
- Fade-in séquentiel des sections
- Copy feedback avec scale + checkmark

## Layout & Structure

### Page Structure
1. **Header** — Logo + titre + description courte
2. **Selection Panel** — 3 cards pour Python, CUDA, PyTorch en grid
3. **Version Matrix** — Affichage visuel de la compatibilité
4. **Command Output** — Zone de commande générée avec bouton copy
5. **Installation Guide** — Instructions complémentaires
6. **Footer** — Liens utiles (GitHub flash_attn, docs)

### Responsive Strategy
- Desktop: 3 colonnes pour les sélecteurs
- Tablet: 2 colonnes
- Mobile: Stack vertical

## Features & Interactions

### Core Features

1. **Sélecteur Python**
   - Versions: 3.9, 3.10, 3.11, 3.12
   - Affichage avec badge "Recommended" pour 3.10/3.11

2. **Sélecteur CUDA**
   - Versions: 11.7, 11.8, 12.1, 12.2
   - Indication de compatibilité PyTorch

3. **Sélecteur PyTorch**
   - Versions: 2.0.x, 2.1.x, 2.2.x, 2.3.x, 2.4.x, 2.5.x
   - Lien vers commande install PyTorch si non présent

4. ** Génération Commande**
   - Construction automatique du bon commit/tag flash_attn
   - Format: `pip install flash-attn --no-build-isolation --quiet`
   - Avec options spécifiques selon versions

5. **Validation Compatibilité**
   - Warning si combinaison non testée
   - Suggestion de version alternative

### Interaction Details
- Hover sur card: glow + scale légère
- Sélection: border accent + checkmark
- Copy: animation confetti + toast "Copied!"
- Invalid combo: shake + message warning

### Edge Cases
- Version non compatible: message rouge + suggestion
- Toutes les combinaisons non supportées: message d'erreur contextuel

## Component Inventory

### VersionSelector
- Card avec icône, label, dropdown/buttons
- States: default, hover, selected, disabled, warning
- Badge pour "recommended"

### CommandOutput
- Zone avec fond plus sombre, syntax highlighting
- Bouton copy avec icône
- States: default, copied, error

### CompatibilityIndicator
- Badge coloré (vert/orange/rouge)
- Tooltip avec explication

### Toast Notification
- Position bottom-right
- Auto-dismiss après 2s
- Icône + message

## Technical Approach

- React + TypeScript + Vite
- Tailwind CSS pour le styling
- State local avec useState
- Pas de backend — tout client-side
- Données de compatibilité hardcodées

## Version Compatibility Matrix

Base de données des combinaisons compatibles:
- Python 3.9-3.12 avec CUDA 11.7-12.2
- PyTorch 2.0-2.5
- flash_attn 2.0.x à 2.5.x
- Commit hash spécifique par combinaison
