import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls, Line } from "@react-three/drei";
import { useRef, useState, useMemo } from "react";
import * as THREE from "three";
import type { FoodResult } from "./api";
const colors = [
  "#e6a36f",
  "#b88067",
  "#d86d57",
  "#a782b4",
  "#e5bf7d",
  "#6d8197",
];
type Props = {
  foods?: FoodResult[];
  remaining?: boolean;
  reduced?: boolean;
  onSelect?: (i: number) => void;
  beforeFraction?: number;
  selected?: number;
  stage?: string;
};
function FoodGeometry({
  label,
  color,
  highlight,
}: {
  label: string;
  color: string;
  highlight: boolean;
}) {
  const name = label.toLowerCase();
  const material = (
    <meshStandardMaterial
      color={highlight ? "#ffd1a8" : color}
      roughness={0.78}
    />
  );
  if (/roti|chapati|bread/.test(name))
    return (
      <group>
        {[0, 1].map((i) => (
          <mesh
            key={i}
            position={[i * 0.08, i * 0.08, 0]}
            rotation={[0, i * 0.3, 0]}
            castShadow
          >
            <cylinderGeometry args={[1, 0.96, 0.08, 28]} />
            {material}
          </mesh>
        ))}
      </group>
    );
  if (/paneer|potato/.test(name))
    return (
      <group>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh
            key={i}
            position={[
              Math.sin(i * 2.4) * 0.55,
              0.14 + (i % 2) * 0.19,
              Math.cos(i * 2.4) * 0.55,
            ]}
            rotation={[i * 0.1, i * 0.7, 0.1]}
            castShadow
          >
            <boxGeometry args={[0.5, 0.45, 0.5]} />
            {material}
          </mesh>
        ))}
      </group>
    );
  if (/dal|curry/.test(name))
    return (
      <group>
        <mesh castShadow scale={[1, 0.19, 0.87]}>
          <sphereGeometry args={[1, 24, 12]} />
          {material}
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[Math.sin(i * 2) * 0.5, 0.19, Math.cos(i * 2) * 0.5]}
            rotation={[-Math.PI / 2, 0, i]}
          >
            <planeGeometry args={[0.2, 0.1]} />
            <meshStandardMaterial color="#7c5262" side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    );
  return (
    <group>
      <mesh castShadow scale={[1, 0.37, 0.86]}>
        <sphereGeometry args={[1, 24, 14]} />
        {material}
      </mesh>
      {Array.from({ length: /rice/.test(name) ? 22 : 9 }, (_, j) => (
        <mesh
          key={j}
          position={[
            Math.sin(j * 2.4) * (0.3 + (j % 3) * 0.18),
            0.15 + (1 - (j % 3) / 3) * 0.26,
            Math.cos(j * 2.4) * (0.3 + (j % 3) * 0.18),
          ]}
          rotation={[0, j, 0]}
          scale={/rice/.test(name) ? [0.1, 0.04, 0.17] : [0.28, 0.13, 0.16]}
          castShadow
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial
            color={
              /salad|sabzi/.test(name)
                ? j % 2
                  ? "#cf866b"
                  : "#83556a"
                : j % 3
                  ? color
                  : "#eae0b7"
            }
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}
function DataParticles({
  reduced,
  active,
  portions,
}: {
  reduced: boolean;
  active: boolean;
  portions: FoodResult[];
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = 24;
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    for (let i = 0; i < count; i++) {
      const portion = portions[i % Math.max(1, portions.length)];
      const p = portion?.geometry?.centroid || [0.5, 0.5];
      const t =
        (reduced ? i / count : clock.elapsedTime * 0.08 + i / count) % 1;
      const angle = i * 2.399;
      const r = active ? 1.3 + t * 1.8 : 2.35;
      dummy.position.set(
        (p[0] - 0.5) * 2 + Math.cos(angle) * r,
        0.15 + (active ? t * 1.4 : Math.sin(angle) * 0.15),
        (p[1] - 0.5) * 2 + Math.sin(angle) * r,
      );
      dummy.scale.setScalar(0.018 + (i % 3) * 0.006);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={active ? "#e5a5dd" : "#8c7aa7"}
        transparent
        opacity={active ? 0.65 : 0.27}
        roughness={1}
      />
    </instancedMesh>
  );
}
function Scene({
  foods,
  remaining,
  reduced = false,
  onSelect,
  beforeFraction,
  selected,
  stage = "",
}: Props) {
  const group = useRef<THREE.Group>(null);
  const scanner = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(-1);
  useFrame(({ pointer, clock }) => {
    if (group.current && !reduced) {
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        pointer.x * 0.05,
        0.03,
      );
      group.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.018;
    }
    if (scanner.current && !reduced) {
      scanner.current.rotation.y = clock.elapsedTime * 0.4;
      scanner.current.position.y = 0.2 + Math.sin(clock.elapsedTime) * 0.08;
    }
  });
  const portions =
    foods ||
    ([
      {
        label: "Rice",
        initial_quantity: 180,
        remaining_quantity: 55,
        geometry: { centroid: [0.34, 0.32] },
      },
      {
        label: "Sabzi",
        initial_quantity: 170,
        remaining_quantity: 40,
        geometry: { centroid: [0.68, 0.45] },
      },
      {
        label: "Dal",
        initial_quantity: 150,
        remaining_quantity: 30,
        geometry: { centroid: [0.42, 0.73] },
      },
    ] as FoodResult[]);
  const total = Math.max(
    1,
    portions.reduce((sum, p) => sum + p.initial_quantity, 0),
  );
  const scanning = /scanning|aligning/i.test(stage);
  const boundaries = /segment|detect|identif/i.test(stage);
  const measurement = /estimating|comparing/i.test(stage);
  const insights = /insight|second serve/i.test(stage);
  const waste = /waste/i.test(stage);
  return (
    <>
      <ambientLight intensity={0.95} />
      <directionalLight
        position={[3, 7, 5]}
        intensity={3.3}
        castShadow
        shadow-mapSize={[512, 512]}
      />
      <pointLight position={[-4, 2, 0]} color="#d5a0e7" intensity={6} />
      <group ref={group} rotation={[0.1, 0, 0]}>
        <mesh receiveShadow>
          <cylinderGeometry args={[2.18, 1.88, 0.12, 72]} />
          <meshStandardMaterial color="#f4dfce" roughness={0.31} />
        </mesh>
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.98, 0.105, 12, 72]} />
          <meshStandardMaterial color="#fff0e3" roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.066, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.73, 1.79, 72]} />
          <meshStandardMaterial color="#b2a4b3" roughness={0.4} />
        </mesh>
        {portions.map((f, i) => {
          const p = f.geometry?.centroid || [
            0.35 + (i % 2) * 0.3,
            0.3 + Math.floor(i / 2) * 0.2,
          ];
          const rest = f.remaining_quantity / Math.max(1, f.initial_quantity);
          const ratio =
            beforeFraction !== undefined
              ? rest + (1 - rest) * beforeFraction
              : remaining
                ? rest
                : 1;
          const radius =
            Math.max(
              0.035,
              Math.sqrt((f.initial_quantity || 1) / total) * 1.35,
            ) * Math.sqrt(ratio);
          return (
            <group
              key={i}
              position={[(p[0] - 0.5) * 3.5, 0.15, (p[1] - 0.5) * 3.5]}
              onClick={() => onSelect?.(i)}
              onPointerOver={() => setHover(i)}
              onPointerOut={() => setHover(-1)}
            >
              <group scale={[radius, radius, radius]}>
                <FoodGeometry
                  label={f.label}
                  color={waste ? "#d9af68" : colors[i % colors.length]}
                  highlight={hover === i || selected === i}
                />
              </group>
              {(boundaries || measurement || selected === i) && (
                <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[radius * 1.02, radius * 1.04, 48]} />
                  <meshBasicMaterial
                    color="#b0d686"
                    transparent
                    opacity={0.65}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}
            </group>
          );
        })}
        {boundaries &&
          foods?.flatMap((f, i) =>
            (f.geometry.polygons || [])
              .slice(0, 3)
              .map((p, j) => (
                <Line
                  key={i + "-" + j}
                  points={[...p, p[0]].map(
                    ([x, z]) =>
                      [(x - 0.5) * 3.5, 0.32, (z - 0.5) * 3.5] as [
                        number,
                        number,
                        number,
                      ],
                  )}
                  color="#a8d181"
                  lineWidth={1.2}
                  transparent
                  opacity={0.85}
                />
              )),
          )}
        {scanning && (
          <group ref={scanner}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[2.26, 0.014, 8, 72]} />
              <meshBasicMaterial color="#bfdc87" transparent opacity={0.6} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[2.3, 2.38, 64, 1, 0, 1]} />
              <meshBasicMaterial
                color="#d0e9a1"
                transparent
                opacity={0.8}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        )}
        {(measurement || insights) && (
          <group>
            {portions.slice(0, 8).map((f, i) => {
              const h = (f.remaining_quantity / Math.max(1, total)) * 4;
              return (
                <mesh key={i} position={[(i - 3.5) * 0.24, h / 2 + 0.1, -2.5]}>
                  <boxGeometry args={[0.13, Math.max(0.02, h), 0.13]} />
                  <meshStandardMaterial
                    color="#b7ce91"
                    transparent
                    opacity={0.7}
                  />
                </mesh>
              );
            })}
          </group>
        )}
        <DataParticles
          reduced={reduced}
          active={insights || scanning}
          portions={portions}
        />
      </group>
      <ContactShadows
        position={[0, -0.22, 0]}
        opacity={0.35}
        scale={9}
        blur={2.8}
        far={3}
      />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={0.3}
        maxPolarAngle={1.15}
        autoRotate={!reduced && !foods}
        autoRotateSpeed={0.22}
      />
    </>
  );
}
export default function Plate(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.35]}
      camera={{ position: [0, 4.8, 5.4], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      frameloop={props.reduced ? "demand" : "always"}
    >
      <Scene {...props} />
    </Canvas>
  );
}
