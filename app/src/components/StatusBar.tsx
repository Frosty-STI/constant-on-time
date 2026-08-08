import { CircleCheck, Database, HardDrive } from 'lucide-react';

import type { LabDefinition } from '../domain/labs';

interface StatusBarProps {
  readonly lab: LabDefinition;
  readonly seed: number;
}

export const StatusBar = ({ lab, seed }: StatusBarProps) => (
  <footer className="status-bar">
    <span><CircleCheck aria-hidden="true" />Offline-ready</span>
    <span><HardDrive aria-hidden="true" />No cloud backend</span>
    <span>Model {lab.abstraction}</span>
    <span><Database aria-hidden="true" />Default seed 0x{seed.toString(16).padStart(8, '0')}</span>
    <span>PSpice examples bundled · execution not claimed</span>
    <span className="ready-state">Ready</span>
  </footer>
);
