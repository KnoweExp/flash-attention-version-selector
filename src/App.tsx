import { useState, useEffect } from 'react'
import versionsData from './data/versions.json'

const { pythonVersions, cudaVersions, pytorchVersions, flashVersions, defaults } = versionsData

function App() {
  const [pythonVersion, setPythonVersion] = useState(defaults.python)
  const [cudaVersion, setCudaVersion] = useState(defaults.cuda)
  const [pytorchVersion, setPytorchVersion] = useState(defaults.pytorch)
  const [flashVersion, setFlashVersion] = useState(defaults.flash)
  const [showCommands, setShowCommands] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  // ── Helper functions (pure, no state mutations) ──

  const isCudaCompatible = (cudaValue: string, pyVer = pythonVersion) => {
    const py = pythonVersions.find(p => p.value === pyVer)
    return py ? py.cuda.includes(cudaValue) : true
  }

  const getAvailableTorchVersions = (cudaVer = cudaVersion, pyVer = pythonVersion) => {
    const cuda = cudaVersions.find(c => c.value === cudaVer)
    const cudaTorch = cuda?.torch || pytorchVersions.map(p => p.value)
    const py = pythonVersions.find(p => p.value === pyVer)
    if (py && 'torch' in py) {
      const pyTorchMinors = (py as any).torch as string[]
      return cudaTorch.filter(tv => {
        const minor = tv.split('.').slice(0, 2).join('.')
        return pyTorchMinors.includes(minor)
      })
    }
    return cudaTorch
  }

  const getFlashForTorch = (torchVer: string) => {
    const pt = pytorchVersions.find(p => p.value === torchVer)
    return pt?.flash || flashVersion
  }

  const isCompatible = () => {
    const cuda = cudaVersions.find(c => c.value === cudaVersion)
    if (cuda && !cuda.torch.includes(pytorchVersion)) return false
    return true
  }

  // ── Cascading selection handlers (compute all dependent state in one go) ──

  const selectPython = (pyVer: string) => {
    setPythonVersion(pyVer)
    // Fix CUDA if needed
    let newCuda = cudaVersion
    if (!isCudaCompatible(cudaVersion, pyVer)) {
      const py = pythonVersions.find(p => p.value === pyVer)
      newCuda = py?.cuda[py.cuda.length - 1] || cudaVersion
      setCudaVersion(newCuda)
    }
    // Fix PyTorch if needed
    const available = getAvailableTorchVersions(newCuda, pyVer)
    let newTorch = pytorchVersion
    if (!available.includes(pytorchVersion) && available.length > 0) {
      newTorch = available[available.length - 1]
      setPytorchVersion(newTorch)
    }
    // Sync flash
    setFlashVersion(getFlashForTorch(newTorch))
  }

  const selectCuda = (cudaVer: string) => {
    setCudaVersion(cudaVer)
    // Fix PyTorch if needed
    const available = getAvailableTorchVersions(cudaVer, pythonVersion)
    let newTorch = pytorchVersion
    if (!available.includes(pytorchVersion) && available.length > 0) {
      newTorch = available[available.length - 1]
      setPytorchVersion(newTorch)
    }
    // Sync flash
    setFlashVersion(getFlashForTorch(newTorch))
  }

  const selectPyTorch = (torchVer: string) => {
    setPytorchVersion(torchVer)
    setFlashVersion(getFlashForTorch(torchVer))
  }

  const getFlashCudaTag = () => {
    const pt = pytorchVersions.find(p => p.value === pytorchVersion)
    return (pt as any)?.cudaTag || 'cu12'
  }

  const getFlashInstallCmd = () => {
    const cp = `cp${pythonVersion.replace('.', '')}`
    const torchMinor = pytorchVersion.split('.').slice(0, 2).join('.')
    const cudaTag = getFlashCudaTag()
    return `pip install "https://github.com/Dao-AILab/flash-attention/releases/download/v${flashVersion}/flash_attn-${flashVersion}+${cudaTag}torch${torchMinor}cxx11abiTRUE-${cp}-${cp}-linux_x86_64.whl"`
  }

  const generateCommands = () => {
    return `# Flash Attention Installer
# Configuration: Python ${pythonVersion} | CUDA ${cudaVersion} | PyTorch ${pytorchVersion} | Flash Attn ${flashVersion}

# 1. Install PyTorch with CUDA ${cudaVersion} support
pip install torch==${pytorchVersion} torchvision torchaudio \\
    --index-url https://download.pytorch.org/whl/cu${cudaVersion.replace('.', '')}

# 2. Install flash-attn (pre-built wheel)
${getFlashInstallCmd()}

# If the wheel above fails, fall back to building from source:
# pip install flash-attn==${flashVersion} --no-build-isolation

# 3. Verify installation
python -c "import torch; from flash_attn import flash_attn_func; print('Flash Attention OK')"`
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copySingleCommand = async (command: string) => {
    await copyToClipboard(command)
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${
      theme === 'dark' 
        ? 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white' 
        : 'bg-gradient-to-br from-slate-50 via-white to-purple-50 text-slate-900'
    }`}>
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {theme === 'dark' ? (
          <>
            <div className="absolute top-1/4 -left-20 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute top-3/4 left-1/3 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
          </>
        ) : (
          <>
            <div className="absolute top-1/4 -left-20 w-72 h-72 bg-purple-200/40 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-200/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute top-3/4 left-1/3 w-64 h-64 bg-pink-200/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
          </>
        )}
      </div>

      <div className={`relative z-10 max-w-4xl mx-auto px-4 py-8 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        
        {/* Header */}
        <header className="text-center mb-12">
          {/* Theme Toggle */}
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                theme === 'dark'
                  ? 'bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              {theme === 'dark' ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  Light mode
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  Dark mode
                </>
              )}
            </button>
          </div>

          <div className="inline-flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 bg-gradient-to-br ${theme === 'dark' ? 'from-cyan-400 to-purple-500' : 'from-purple-500 to-pink-500'} rounded-xl flex items-center justify-center text-2xl shadow-lg ${theme === 'dark' ? 'shadow-purple-500/30' : 'shadow-purple-500/20'}`}>
              ⚡
            </div>
            <h1 className={`text-4xl md:text-5xl font-bold bg-gradient-to-r ${
              theme === 'dark' 
                ? 'from-white via-cyan-200 to-purple-300 bg-clip-text text-transparent' 
                : 'from-purple-600 via-pink-600 to-cyan-600 bg-clip-text text-transparent'
            }`}>
              Flash Attention
            </h1>
          </div>
          <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'} text-lg`}>
            Installer — Configure your environment in 30 seconds
          </p>
        </header>

        {/* Selection Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          
          {/* Python Version */}
          <div className={`backdrop-blur-xl rounded-2xl p-5 transition-all duration-300 hover:shadow-xl ${
            theme === 'dark'
              ? 'bg-white/5 border border-white/10 hover:border-yellow-500/30 hover:shadow-yellow-500/10'
              : 'bg-white/80 border border-slate-200 hover:border-yellow-400/50 hover:shadow-yellow-500/10'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center text-lg">🐍</div>
              <div>
                <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Python</h3>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Python version</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {pythonVersions.map(py => (
                <button
                  key={py.value}
                  onClick={() => selectPython(py.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    pythonVersion === py.value
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : theme === 'dark'
                        ? 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {py.label}
                </button>
              ))}
            </div>
          </div>

          {/* CUDA Version */}
          <div className={`backdrop-blur-xl rounded-2xl p-5 transition-all duration-300 hover:shadow-xl ${
            theme === 'dark'
              ? 'bg-white/5 border border-white/10 hover:border-cyan-500/30 hover:shadow-cyan-500/10'
              : 'bg-white/80 border border-slate-200 hover:border-cyan-400/50 hover:shadow-cyan-500/10'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-lg">🟢</div>
              <div>
                <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>CUDA</h3>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>CUDA toolkit version</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {cudaVersions.map(cuda => {
                const compatible = isCudaCompatible(cuda.value)
                return (
                  <button
                    key={cuda.value}
                    onClick={() => compatible && selectCuda(cuda.value)}
                    disabled={!compatible}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      !compatible
                        ? theme === 'dark'
                          ? 'bg-white/3 text-slate-600 cursor-not-allowed line-through opacity-40'
                          : 'bg-slate-50 text-slate-300 cursor-not-allowed line-through opacity-40'
                        : cudaVersion === cuda.value
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30'
                          : theme === 'dark'
                            ? 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                    title={!compatible ? `Not compatible with Python ${pythonVersion}` : ''}
                  >
                    {cuda.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* PyTorch Version */}
          <div className={`backdrop-blur-xl rounded-2xl p-5 transition-all duration-300 hover:shadow-xl ${
            theme === 'dark'
              ? 'bg-white/5 border border-white/10 hover:border-red-500/30 hover:shadow-red-500/10'
              : 'bg-white/80 border border-slate-200 hover:border-red-400/50 hover:shadow-red-500/10'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center text-lg">🔥</div>
              <div>
                <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>PyTorch</h3>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>PyTorch version</p>
              </div>
            </div>
            <select
              value={pytorchVersion}
              onChange={(e) => selectPyTorch(e.target.value)}
              className={`w-full rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500/50 cursor-pointer appearance-none transition-all ${
                theme === 'dark'
                  ? 'bg-white/10 border border-white/20 text-white'
                  : 'bg-slate-100 border border-slate-300 text-slate-900'
              }`}
            >
              {getAvailableTorchVersions().map(v => {
                const pv = pytorchVersions.find(p => p.value === v)
                return (
                  <option key={v} value={v} className={theme === 'dark' ? 'bg-slate-800' : 'bg-white'}>
                    {pv?.label || `PyTorch ${v}`}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Flash Attention Version */}
          <div className={`backdrop-blur-xl rounded-2xl p-5 transition-all duration-300 hover:shadow-xl ${
            theme === 'dark'
              ? 'bg-white/5 border border-white/10 hover:border-green-500/30 hover:shadow-green-500/10'
              : 'bg-white/80 border border-slate-200 hover:border-green-400/50 hover:shadow-green-500/10'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center text-lg">⚡</div>
              <div>
                <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Flash Attn</h3>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Flash Attention version</p>
              </div>
            </div>
            <select
              value={flashVersion}
              onChange={(e) => setFlashVersion(e.target.value)}
              className={`w-full rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 cursor-pointer appearance-none transition-all ${
                theme === 'dark'
                  ? 'bg-white/10 border border-white/20 text-white'
                  : 'bg-slate-100 border border-slate-300 text-slate-900'
              }`}
            >
              {flashVersions.map(f => (
                <option key={f.value} value={f.value} className={theme === 'dark' ? 'bg-slate-800' : 'bg-white'}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Compatibility Warning */}
        {!isCompatible() && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            theme === 'dark' 
              ? 'bg-amber-500/10 border border-amber-500/30' 
              : 'bg-amber-50 border border-amber-300'
          }`}>
            <span className="text-2xl">⚠️</span>
            <div>
              <p className={`font-medium ${theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}`}>Untested combination</p>
              <p className={`text-sm ${theme === 'dark' ? 'text-amber-300/70' : 'text-amber-600'}`}>This combination may not work. Try the recommended versions.</p>
            </div>
          </div>
        )}

        {/* Main Action Button */}
        <div className="mb-8">
          <button
            onClick={() => setShowCommands(!showCommands)}
            className={`w-full py-5 rounded-2xl font-bold text-xl transition-all duration-300 transform ${
              showCommands
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 shadow-2xl shadow-green-500/30 scale-[1.02]'
                : theme === 'dark'
                  ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 hover:shadow-2xl hover:shadow-purple-500/40 hover:scale-[1.02]'
                  : 'bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 hover:shadow-2xl hover:shadow-purple-500/30 hover:scale-[1.02] text-white'
            }`}
          >
            <span className="flex items-center justify-center gap-3">
              {showCommands ? (
                <>
                  <span className="text-2xl">✓</span>
                  Configuration Ready!
                </>
              ) : (
                <>
                  <span className="text-2xl">🚀</span>
                  Generate Installation Commands
                </>
              )}
            </span>
          </button>
        </div>

        {/* GPU Rental Section */}
        <div className="mb-8">
          {/* CTA Header */}
          <div className="text-center mb-6">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3 ${
              theme === 'dark'
                ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
                : 'bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-300'
            }`}>
              <span className={theme === 'dark' ? 'text-purple-400' : 'text-purple-500'}>💜</span>
              <span className={`text-sm font-medium ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`}>Support this project</span>
            </div>
            <h2 className={`text-2xl md:text-3xl font-bold mb-2 ${
              theme === 'dark' ? 'text-white' : 'text-slate-900'
            }`}>
              Need a GPU? Rent one now!
            </h2>
            <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'} text-sm`}>
              Flash Attention needs serious GPU power. Partnered providers below — affiliate links help maintain this tool ✨
            </p>
          </div>

          {/* Provider Cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            
            {/* Vast AI */}
            <a
              href="https://cloud.vast.ai/?ref_id=322456"
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative rounded-2xl p-5 transition-all duration-300 overflow-hidden ${
                theme === 'dark'
                  ? 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/50'
                  : 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-cyan-400 shadow-sm hover:shadow-md'
              }`}
            >
              <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl rounded-tr-2xl text-xs font-medium ${
                theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-600'
              }`}>
                Affiliate
              </div>
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform ${
                  theme === 'dark' ? 'shadow-lg shadow-cyan-500/20' : 'shadow-md'
                }`}>
                  ☁️
                </div>
                <div className="flex-1">
                  <h3 className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Vast AI</h3>
                  <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Budget-friendly GPUs from $0.08/hr</p>
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'
                  }`}>
                    <span>Rent GPU</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </div>
            </a>

            {/* RunPod */}
            <a
              href="https://runpod.io?ref=h56q789e"
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative rounded-2xl p-5 transition-all duration-300 overflow-hidden ${
                theme === 'dark'
                  ? 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/50'
                  : 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-purple-400 shadow-sm hover:shadow-md'
              }`}
            >
              <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl rounded-tr-2xl text-xs font-medium ${
                theme === 'dark' ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-600'
              }`}>
                Affiliate
              </div>
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 bg-gradient-to-br from-purple-400 to-pink-500 rounded-xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform ${
                  theme === 'dark' ? 'shadow-lg shadow-purple-500/20' : 'shadow-md'
                }`}>
                  🚀
                </div>
                <div className="flex-1">
                  <h3 className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>RunPod</h3>
                  <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>GPU Cloud with easy deployment</p>
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                  }`}>
                    <span>Rent GPU</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </div>
            </a>

          </div>

          {/* Affiliate disclaimer */}
          <p className={`text-center text-xs mt-4 ${
            theme === 'dark' ? 'text-slate-500' : 'text-slate-500'
          }`}>
            * These are affiliate links. Using them costs you nothing but helps support this project ❤️
          </p>
        </div>

        {/* Installation Commands */}
        {showCommands && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
            
            {/* Quick Copy */}
            <div className={`rounded-2xl p-5 ${
              theme === 'dark'
                ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30'
                : 'bg-gradient-to-r from-green-100 to-emerald-100 border border-green-300'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className={`font-semibold ${theme === 'dark' ? 'text-green-400' : 'text-green-700'}`}>Copy All</p>
                    <p className={`text-sm ${theme === 'dark' ? 'text-green-300/60' : 'text-green-600'}`}>Copy all commands at once</p>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(generateCommands())}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 ${
                    theme === 'dark'
                      ? 'bg-green-500 hover:bg-green-400 text-white'
                      : 'bg-green-600 hover:bg-green-500 text-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <span>✓</span> Copied!
                    </>
                  ) : (
                    <>
                      <span>📎</span> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Individual Commands */}
            <div className="space-y-3">
              
              {/* Step 1: PyTorch */}
              <div className={`rounded-xl overflow-hidden border ${
                theme === 'dark'
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white border-slate-200'
              }`}>
                <div className={`flex items-center justify-between px-5 py-4 ${
                  theme === 'dark' ? 'bg-white/5' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center font-bold text-sm text-white">1</span>
                    <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Install PyTorch {pytorchVersion}</span>
                  </div>
                  <button
                    onClick={() => copySingleCommand(`pip install torch==${pytorchVersion} torchvision torchaudio --index-url https://download.pytorch.org/whl/cu${cudaVersion.replace('.', '')}`)}
                    className={`px-4 py-2 rounded-lg text-sm transition-all ${
                      theme === 'dark'
                        ? 'bg-white/10 hover:bg-white/20 text-white'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                    }`}
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="px-5 py-4 font-mono text-sm">
                  <code className={theme === 'dark' ? 'text-cyan-300 break-all' : 'text-cyan-700 break-all'}>
                    {`pip install torch==${pytorchVersion} torchvision torchaudio \\`}
                    <br />
                    {`    --index-url https://download.pytorch.org/whl/cu${cudaVersion.replace('.', '')}`}
                  </code>
                </div>
              </div>

              {/* Step 2: Flash Attention */}
              <div className={`rounded-xl overflow-hidden border ${
                theme === 'dark'
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white border-slate-200'
              }`}>
                <div className={`flex items-center justify-between px-5 py-4 ${
                  theme === 'dark' ? 'bg-white/5' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center font-bold text-sm text-white">2</span>
                    <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Install Flash Attention {flashVersion}</span>
                  </div>
                  <button
                    onClick={() => copySingleCommand(getFlashInstallCmd())}
                    className={`px-4 py-2 rounded-lg text-sm transition-all ${
                      theme === 'dark'
                        ? 'bg-white/10 hover:bg-white/20 text-white'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                    }`}
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="px-5 py-4 font-mono text-sm">
                  <code className={theme === 'dark' ? 'text-green-300 break-all' : 'text-green-700 break-all'}>
                    {getFlashInstallCmd()}
                  </code>
                </div>
              </div>

              {/* Step 3: Verify */}
              <div className={`rounded-xl overflow-hidden border ${
                theme === 'dark'
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white border-slate-200'
              }`}>
                <div className={`flex items-center justify-between px-5 py-4 ${
                  theme === 'dark' ? 'bg-white/5' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-sm text-white">3</span>
                    <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Verify Installation</span>
                  </div>
                  <button
                    onClick={() => copySingleCommand(`python -c "import torch; from flash_attn import flash_attn_func; print('OK Flash Attention works!')"`)}
                    className={`px-4 py-2 rounded-lg text-sm transition-all ${
                      theme === 'dark'
                        ? 'bg-white/10 hover:bg-white/20 text-white'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                    }`}
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="px-5 py-4 font-mono text-sm">
                  <code className={theme === 'dark' ? 'text-cyan-300' : 'text-cyan-700'}>
                    {`python -c "import torch; from flash_attn import flash_attn_func; print('OK Flash Attention works!')"`}
                  </code>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className={`rounded-xl p-4 ${
              theme === 'dark'
                ? 'bg-blue-500/10 border border-blue-500/20'
                : 'bg-blue-50 border border-blue-200'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">💡</span>
                <div className="text-sm">
                  <p className={`font-medium mb-1 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>Tip</p>
                  <p className={theme === 'dark' ? 'text-blue-200/60' : 'text-blue-600'}>
                    Flash-attn installation requires a CUDA compiler. If you encounter errors, try using 
                    <code className={`${theme === 'dark' ? 'bg-white/10' : 'bg-blue-100'} px-2 py-0.5 rounded ml-1`}>--find-links</code> with pre-compiled wheels.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className={`mt-16 text-center text-sm ${
          theme === 'dark' ? 'text-slate-500' : 'text-slate-500'
        }`}>
          <p>Compatible with Flash Attention 2.x • Regular updates</p>
          <p className="mt-1">
            <a href="https://github.com/Dao-AILab/flash-attention" target="_blank" rel="noopener noreferrer" className={`transition-colors ${
              theme === 'dark' ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-500'
            }`}>
              GitHub: Dao-AILab/flash-attention →
            </a>
          </p>
        </footer>

      </div>
    </div>
  )
}

export default App
