import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { 
  Maximize2, 
  RotateCcw, 
  Layers, 
  Eye, 
  Activity, 
  AlertTriangle, 
  Info,
  TrendingUp,
  Compass,
  Camera as CameraIcon
} from 'lucide-react';
import { GridDensityCell } from '../types';
import { useTheme } from '../context/ThemeContext';

export interface SpatialDensity3DProps {
  gridData: GridDensityCell[] | null | undefined;
  isLoading?: boolean;
  onSelectZone?: (zone: GridDensityCell) => void;
  selectedZoneName?: string | null;
  cameraName?: string | null;
  className?: string;
  heightClassName?: string;
}

type VisualizationMode = 'density' | 'risk' | 'velocity';

// Helper to determine zone level
const getZoneLevel = (density: number, risk: number, mode: VisualizationMode): 'Low' | 'Moderate' | 'High' | 'Critical' => {
  if (mode === 'risk') {
    if (risk >= 70) return 'Critical';
    if (risk >= 45) return 'High';
    if (risk >= 25) return 'Moderate';
    return 'Low';
  }
  if (density >= 0.75) return 'Critical';
  if (density >= 0.50) return 'High';
  if (density >= 0.25) return 'Moderate';
  return 'Low';
};

// Hex colors matching CROWDGUARD brand palette
const BRAND_COLORS = {
  mutedTeal: 0x376E6F,
  slateBlue: 0x2F4454,
  dustyRose: 0xDA7B93,
  deepBurgundy: 0x2E151B,
  deepTeal: 0x1C3334,
  cream: 0xF8F6F3,
};

export const SpatialDensity3D: React.FC<SpatialDensity3DProps> = ({
  gridData,
  isLoading = false,
  onSelectZone,
  selectedZoneName,
  cameraName = 'SURVEILLANCE NODE',
  className = '',
  heightClassName = '',
}) => {
  const { isDark } = useTheme();
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<VisualizationMode>('density');
  const [hoveredCell, setHoveredCell] = useState<GridDensityCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridDensityCell | null>(null);
  const [viewAngle, setViewAngle] = useState<'isometric' | 'top_down'>('isometric');
  const [webGlSupported, setWebGlSupported] = useState<boolean>(true);

  // Maintain selectedCell state in sync with prop if passed
  useEffect(() => {
    if (selectedZoneName && gridData) {
      const match = gridData.find((c) => c.name === selectedZoneName);
      if (match) setSelectedCell(match);
    }
  }, [selectedZoneName, gridData]);

  // Construct stable 3x3 layout (9 cells)
  const quadrants = useMemo(() => {
    if (!gridData || gridData.length === 0) {
      // Default 9 empty quadrants if data not yet received
      const defaults: GridDensityCell[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          defaults.push({
            name: `Zone (${r},${c})`,
            population: 0,
            normalized_density: 0,
            density_level: 'Low',
            avg_velocity: 0,
            inflow: 0,
            outflow: 0,
            zone_risk: 0,
            pattern: 'Uniform',
          });
        }
      }
      return defaults;
    }
    return gridData.slice(0, 9);
  }, [gridData]);

  // -------------------------------------------------------------------------
  // THREE.JS SCENE LIFECYCLE
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Check WebGL availability
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGlSupported(false);
        return;
      }
    } catch {
      setWebGlSupported(false);
      return;
    }

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent canvas background to blend with card

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    const setCamPosition = (angle: 'isometric' | 'top_down') => {
      if (angle === 'isometric') {
        camera.position.set(11, 11, 13);
        camera.lookAt(0, 0.8, 0);
      } else {
        camera.position.set(0.01, 18, 0.01);
        camera.lookAt(0, 0, 0);
      }
    };
    setCamPosition(viewAngle);

    // 3. Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
    } catch {
      setWebGlSupported(false);
      return;
    }

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(
      isDark ? 0x223638 : 0xFFFAF0, 
      isDark ? 1.6 : 1.9
    );
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xFFFFFF, isDark ? 2.0 : 2.5);
    dirLight.position.set(12, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(
      isDark ? BRAND_COLORS.mutedTeal : 0xCBD5D8, 
      0.8
    );
    fillLight.position.set(-10, 8, -10);
    scene.add(fillLight);

    // 5. Ground Plaza Platform
    const floorSize = 9.2;
    const groundGeo = new THREE.PlaneGeometry(floorSize, floorSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x0E1A1B : 0xF3EFEA,
      roughness: 0.7,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(
      floorSize, 
      6, 
      isDark ? BRAND_COLORS.mutedTeal : 0xCBD5D8, 
      isDark ? 0x1A2E30 : 0xE5DFD5
    );
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // 6. Perimeter Boundary Frame
    const borderGeo = new THREE.BoxGeometry(floorSize + 0.15, 0.08, floorSize + 0.15);
    const borderMat = new THREE.MeshBasicMaterial({
      color: isDark ? 0x233C3F : 0xCBD5D8,
      wireframe: true,
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.y = 0.02;
    scene.add(borderMesh);

    // 7. Surveillance Camera Mast & Frustum Marker
    const cameraGroup = new THREE.Group();
    // Mast post
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.8, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x5D757E : 0x2F4454 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(-4.2, 0.9, 4.2);
    cameraGroup.add(mast);

    // Camera head
    const headGeo = new THREE.BoxGeometry(0.35, 0.22, 0.5);
    const headMat = new THREE.MeshStandardMaterial({ color: BRAND_COLORS.mutedTeal });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(-4.2, 1.8, 4.2);
    head.lookAt(0, 0.5, 0);
    cameraGroup.add(head);

    // Frustum cone indicating CCTV field of coverage
    const frustumGeo = new THREE.ConeGeometry(3.8, 6.2, 4, 1, true);
    const frustumMat = new THREE.MeshBasicMaterial({
      color: isDark ? 0x6EB5B6 : BRAND_COLORS.mutedTeal,
      wireframe: true,
      transparent: true,
      opacity: isDark ? 0.22 : 0.18,
    });
    const frustum = new THREE.Mesh(frustumGeo, frustumMat);
    frustum.position.set(-2.2, 0.9, 2.2);
    frustum.lookAt(0, 0, 0);
    frustum.rotateX(Math.PI / 2);
    cameraGroup.add(frustum);

    scene.add(cameraGroup);

    // 8. 3x3 Quadrant Plinths
    const columnGroup = new THREE.Group();
    const columns: { mesh: THREE.Mesh; cap: THREE.LineSegments; cellIndex: number }[] = [];
    const sprites: THREE.Sprite[] = [];
    const cellWidth = 2.2;
    const gap = 0.4;
    const totalStep = cellWidth + gap;
    const sectorCodes = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

    const createSectorSprite = (code: string, isDarkTheme: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = 'bold 32px monospace';
        ctx.fillStyle = isDarkTheme ? '#8AA1A7' : '#2F4454';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(code, 64, 32);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const spMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8 });
      const sprite = new THREE.Sprite(spMat);
      sprite.scale.set(1.1, 0.55, 1);
      return sprite;
    };

    quadrants.forEach((cell, idx) => {
      const row = Math.floor(idx / 3) - 1; // -1, 0, 1
      const col = (idx % 3) - 1;           // -1, 0, 1

      // Height calculation based on active mode
      let metricNormalized = 0;
      if (activeMode === 'density') {
        metricNormalized = Math.max(0.08, Math.min(1.0, cell.normalized_density));
      } else if (activeMode === 'risk') {
        metricNormalized = Math.max(0.08, Math.min(1.0, cell.zone_risk / 100));
      } else {
        metricNormalized = Math.max(0.08, Math.min(1.0, cell.avg_velocity / 40));
      }

      const heightVal = Math.max(0.35, metricNormalized * 3.4);

      // Color calculation based on brand palette
      let colorHex = BRAND_COLORS.mutedTeal;
      const level = getZoneLevel(cell.normalized_density, cell.zone_risk, activeMode);
      if (level === 'Critical') colorHex = BRAND_COLORS.deepBurgundy;
      else if (level === 'High') colorHex = BRAND_COLORS.dustyRose;
      else if (level === 'Moderate') colorHex = BRAND_COLORS.slateBlue;
      else colorHex = BRAND_COLORS.mutedTeal;

      // Extruded Block
      const geo = new THREE.BoxGeometry(cellWidth, heightVal, cellWidth);
      const isSelected = selectedCell?.name === cell.name;
      const isHovered = hoveredCell?.name === cell.name;

      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.35,
        metalness: 0.15,
        transparent: true,
        opacity: isSelected ? 0.96 : isHovered ? 0.92 : isDark ? 0.85 : 0.80,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(col * totalStep, heightVal / 2, row * totalStep);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Edges wireframe on top cap
      const edges = new THREE.EdgesGeometry(geo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0xFFFFFF : isDark ? 0x90CCD0 : 0xFFFFFF,
        linewidth: isSelected ? 2 : 1,
      });
      const cap = new THREE.LineSegments(edges, edgeMat);
      cap.position.copy(mesh.position);

      mesh.userData = { cellIndex: idx };

      // Sector Floating Sprite Label
      const sprite = createSectorSprite(sectorCodes[idx] || `Z${idx}`, isDark);
      sprite.position.set(col * totalStep, heightVal + 0.45, row * totalStep);
      sprites.push(sprite);

      columnGroup.add(mesh);
      columnGroup.add(cap);
      columnGroup.add(sprite);
      columns.push({ mesh, cap, cellIndex: idx });
    });

    scene.add(columnGroup);

    // 9. Interactive Raycasting & Pointer Tracking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(columns.map((c) => c.mesh));

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const cellIdx = hit.userData.cellIndex;
        if (cellIdx !== undefined && quadrants[cellIdx]) {
          setHoveredCell(quadrants[cellIdx]);
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      setHoveredCell(null);
      renderer.domElement.style.cursor = 'grab';
    };

    const handlePointerClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(columns.map((c) => c.mesh));

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const cellIdx = hit.userData.cellIndex;
        if (cellIdx !== undefined && quadrants[cellIdx]) {
          const chosen = quadrants[cellIdx];
          setSelectedCell(chosen);
          if (onSelectZone) onSelectZone(chosen);
        }
      }
    };

    // Smooth Orbit Drag Controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = new THREE.Spherical().setFromVector3(camera.position);

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onMouseMoveOrbit = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      spherical.theta -= deltaX * 0.007;
      spherical.phi = Math.max(0.15, Math.min(Math.PI / 2.05, spherical.phi - deltaY * 0.007));
      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0.8, 0);
    };

    const onMouseUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(7, Math.min(24, spherical.radius + e.deltaY * 0.015));
      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0.8, 0);
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousemove', handlePointerMove);
    domEl.addEventListener('click', handlePointerClick);
    domEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMoveOrbit);
    window.addEventListener('mouseup', onMouseUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });

    // 10. Animation Loop
    let animId: number;
    let clock = new THREE.Clock();
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Subtle atmospheric beacon pulsation for high-risk zones if motion permitted
      if (!isReducedMotion) {
        columns.forEach(({ mesh, cellIndex }) => {
          const cell = quadrants[cellIndex];
          if (cell && (cell.zone_risk >= 50 || cell.normalized_density >= 0.65)) {
            const pulse = 1.0 + Math.sin(elapsed * 3.5 + cellIndex) * 0.03;
            mesh.scale.set(1.0, pulse, 1.0);
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // Responsive resize handler
    const handleResize = () => {
      if (!container || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup resources
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', onMouseMoveOrbit);
      window.removeEventListener('mouseup', onMouseUp);
      domEl.removeEventListener('mousemove', handlePointerMove);
      domEl.removeEventListener('click', handlePointerClick);
      domEl.removeEventListener('mousedown', onMouseDown);
      domEl.removeEventListener('wheel', onWheel);

      // Dispose three.js objects
      sprites.forEach((s) => {
        if (s.material.map) s.material.map.dispose();
        s.material.dispose();
      });

      columns.forEach(({ mesh, cap }) => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material.dispose();
        cap.geometry.dispose();
        if (Array.isArray(cap.material)) cap.material.forEach((m) => m.dispose());
        else cap.material.dispose();
      });

      groundGeo.dispose();
      groundMat.dispose();
      borderGeo.dispose();
      borderMat.dispose();
      mastGeo.dispose();
      mastMat.dispose();
      headGeo.dispose();
      headMat.dispose();
      frustumGeo.dispose();
      frustumMat.dispose();

      renderer.dispose();
      if (domEl.parentNode) domEl.parentNode.removeChild(domEl);
    };
  }, [quadrants, activeMode, isDark, viewAngle, onSelectZone]);

  const resetCamera = useCallback(() => {
    setViewAngle((prev) => (prev === 'isometric' ? 'top_down' : 'isometric'));
  }, []);

  // Displayed metrics for the currently inspected quadrant
  const activeZoneInfo = selectedCell || hoveredCell || quadrants[4] || quadrants[0];

  return (
    <div className={`relative bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl overflow-hidden shadow-xs flex flex-col justify-between ${className}`}>
      {/* 1. Header Toolbar & Perspective Mode Selector */}
      <div className="p-4 border-b border-[#E2E8EA] dark:border-[#203638] flex flex-wrap items-center justify-between gap-3 bg-[#F8F6F3]/60 dark:bg-[#0E1A1B]/60">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#376E6F]/10 dark:bg-[#376E6F]/25 border border-[#376E6F]/30 flex items-center justify-center text-[#376E6F] dark:text-[#6EB5B6] shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1C3334] dark:text-[#EDF4F5]">
                3D Spatial Plaza Matrix
              </h3>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#376E6F]/10 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30">
                RELATIVE 3×3 SECTORS
              </span>
            </div>
            <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">
              Perspective Monocular Elevation Mapping • Node: {cameraName}
            </p>
          </div>
        </div>

        {/* Mode Selector and Perspective Toggle */}
        <div className="flex items-center space-x-1.5">
          <div className="flex items-center p-0.5 rounded-lg bg-[#EDE8E1] dark:bg-[#0B1415] border border-[#CBD5D8] dark:border-[#233C3F] text-[10px] font-mono">
            <button
              onClick={() => setActiveMode('density')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                activeMode === 'density'
                  ? 'bg-white dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] font-bold shadow-2xs'
                  : 'text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white'
              }`}
              title="Show crowd population density height"
            >
              Density
            </button>
            <button
              onClick={() => setActiveMode('risk')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                activeMode === 'risk'
                  ? 'bg-white dark:bg-[#183133] text-[#DA7B93] font-bold shadow-2xs'
                  : 'text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white'
              }`}
              title="Show composite hazard risk height"
            >
              Risk
            </button>
            <button
              onClick={() => setActiveMode('velocity')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                activeMode === 'velocity'
                  ? 'bg-white dark:bg-[#183133] text-[#2F4454] dark:text-[#88A8C0] font-bold shadow-2xs'
                  : 'text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white'
              }`}
              title="Show Farneback optical flow velocity"
            >
              Flow
            </button>
          </div>

          <button
            onClick={resetCamera}
            className="p-1.5 rounded-lg bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] shadow-2xs text-[10px] transition cursor-pointer flex items-center space-x-1"
            title="Toggle between Isometric 3D angle and 2D Top-Down Plan view"
            aria-label="Toggle camera view angle"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono">{viewAngle === 'isometric' ? 'Top-Down' : 'Iso 3D'}</span>
          </button>
        </div>
      </div>

      {/* 2. Primary 3D Viewport Area */}
      <div className={`relative w-full ${heightClassName || 'h-80 sm:h-96 min-h-[300px]'} bg-gradient-to-b from-[#F8F6F3] to-[#ECE7DF] dark:from-[#0B1415] dark:to-[#112022] flex items-center justify-center overflow-hidden select-none`}>
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 bg-white/70 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center space-x-2 text-xs font-mono text-[#376E6F] dark:text-[#6EC4C6]">
            <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            <span>Calculating 3D Spatial Deposition...</span>
          </div>
        )}

        {/* Real Three.js Canvas Container */}
        {webGlSupported ? (
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
        ) : (
          /* Graceful 2.5D CSS Perspective Fallback */
          <div className="w-full h-full p-6 flex flex-col items-center justify-center">
            <div className="grid grid-cols-3 gap-3 w-64 max-w-full">
              {quadrants.map((q, idx) => {
                const level = getZoneLevel(q.normalized_density, q.zone_risk, activeMode);
                const isSelected = selectedCell?.name === q.name;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedCell(q);
                      if (onSelectZone) onSelectZone(q);
                    }}
                    className={`aspect-square p-2 rounded-lg border text-center transition cursor-pointer flex flex-col justify-between ${
                      level === 'Critical'
                        ? 'bg-[#2E151B] text-white border-rose-500'
                        : level === 'High'
                        ? 'bg-[#DA7B93] text-white border-rose-300'
                        : level === 'Moderate'
                        ? 'bg-[#2F4454] text-white border-slate-400'
                        : 'bg-[#376E6F]/20 text-[#1C3334] dark:text-white border-[#376E6F]/40'
                    } ${isSelected ? 'ring-2 ring-white scale-105 shadow-md' : ''}`}
                  >
                    <span className="text-[9px] font-mono opacity-80">{q.name.replace('Zone ', '')}</span>
                    <span className="text-xs font-bold font-mono">{q.population}p</span>
                    <span className="text-[8px] uppercase">{q.density_level}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono mt-3">
              Standard 2.5D fallback active (WebGL canvas unavailable)
            </p>
          </div>
        )}

        {/* Overlay Camera Frustum Watermark */}
        <div className="absolute top-3 left-3 pointer-events-none flex items-center space-x-1.5 px-2 py-1 rounded bg-black/40 text-white backdrop-blur-xs text-[10px] font-mono">
          <CameraIcon className="w-3 h-3 text-[#6EB5B6]" />
          <span>CAM FRUSTUM: S-W HORIZON (Z0-Z8)</span>
        </div>

        {/* Orbit hint */}
        <div className="absolute bottom-3 right-3 pointer-events-none hidden sm:flex items-center space-x-1 px-2 py-0.5 rounded bg-black/30 text-white/80 backdrop-blur-xs text-[9px] font-mono">
          <span>Click & Drag to Orbit • Scroll to Zoom</span>
        </div>
      </div>

      {/* 3. Detail Telemetry Ribbon for Inspected Quadrant */}
      <div className="p-3 bg-[#F8F6F3] dark:bg-[#0E1A1B] border-t border-[#E2E8EA] dark:border-[#203638] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Left: Selected Sector Identity */}
        <div className="flex items-center space-x-2.5">
          <div className={`w-3 h-3 rounded-full shrink-0 ${
            activeZoneInfo.zone_risk >= 70 ? 'bg-[#2E151B] animate-pulse ring-2 ring-rose-400' :
            activeZoneInfo.zone_risk >= 45 ? 'bg-[#DA7B93] ring-1 ring-rose-300' :
            activeZoneInfo.zone_risk >= 25 ? 'bg-[#2F4454]' : 'bg-[#376E6F]'
          }`} />
          <div>
            <div className="flex items-center space-x-1.5 font-bold font-mono text-[#1C3334] dark:text-[#EDF4F5]">
              <span>{activeZoneInfo.name}</span>
              <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-normal">
                {activeZoneInfo.name === 'Zone (1,1)' ? '• Center Core' : '• Perimeter Quadrant'}
              </span>
            </div>
            <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">
              Pattern: {activeZoneInfo.pattern || 'Uniform Laminar'}
            </span>
          </div>
        </div>

        {/* Right: Micro-Metrics Bar */}
        <div className="grid grid-cols-4 divide-x divide-[#CBD5D8] dark:divide-[#233C3F] bg-white dark:bg-[#152729] rounded-lg border border-[#CBD5D8] dark:border-[#233C3F] px-2 py-1 text-center font-mono">
          <div className="px-2">
            <span className="text-[8px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block font-sans">Crowd</span>
            <span className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] tabular-nums">
              {activeZoneInfo.population} <span className="text-[9px] font-normal">p</span>
            </span>
          </div>
          <div className="px-2">
            <span className="text-[8px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block font-sans">Density</span>
            <span className="text-xs font-bold text-[#376E6F] dark:text-[#6EC4C6] tabular-nums">
              {(activeZoneInfo.normalized_density * 100).toFixed(0)}%
            </span>
          </div>
          <div className="px-2">
            <span className="text-[8px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block font-sans">Velocity</span>
            <span className="text-xs font-bold text-[#2F4454] dark:text-[#88A8C0] tabular-nums">
              {activeZoneInfo.avg_velocity.toFixed(1)} <span className="text-[8px] font-normal">px/s</span>
            </span>
          </div>
          <div className="px-2">
            <span className="text-[8px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block font-sans">Sector Risk</span>
            <span className={`text-xs font-bold tabular-nums ${
              activeZoneInfo.zone_risk >= 70 ? 'text-[#2E151B] dark:text-rose-400' :
              activeZoneInfo.zone_risk >= 45 ? 'text-[#DA7B93]' :
              activeZoneInfo.zone_risk >= 25 ? 'text-[#2F4454] dark:text-[#88A8C0]' : 'text-[#376E6F] dark:text-[#6EC4C6]'
            }`}>
              {activeZoneInfo.zone_risk.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-2 text-[9px] font-mono text-[#5D757E] dark:text-[#A0B7BC]">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-xs bg-[#376E6F]" />
            <span>Low</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-xs bg-[#2F4454]" />
            <span>Mod</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-xs bg-[#DA7B93]" />
            <span>High</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-xs bg-[#2E151B]" />
            <span>Crit</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default SpatialDensity3D;
