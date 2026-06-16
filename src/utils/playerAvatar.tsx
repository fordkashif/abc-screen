import React from 'react';
import type { PlayerRecord } from '@abc/shared';
import avatarDino from '../assets/controller-avatars/dino.png';
import avatarCat from '../assets/controller-avatars/cat.png';
import avatarPuppy from '../assets/controller-avatars/puppy.png';
import avatarRobot from '../assets/controller-avatars/robot.png';
import avatarUnicorn from '../assets/controller-avatars/unicorn.png';
import avatarStar from '../assets/controller-avatars/star.png';

const AVATAR_COLORS = ['#58cc02', '#1cb0f6', '#ce82ff', '#ff9600', '#ff4b4b', '#ffd900', '#0d91d0', '#a560ed'];

const AVATAR_IMAGES: Record<string, string> = {
  Dino: avatarDino,
  Cat: avatarCat,
  Puppy: avatarPuppy,
  Robot: avatarRobot,
  Unicorn: avatarUnicorn,
  Star: avatarStar,
};

export function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

type PlayerAvatarProps = {
  player: PlayerRecord;
  className: string;
  size?: number;
  style?: React.CSSProperties;
};

export function PlayerAvatar({ player, className, size, style }: PlayerAvatarProps) {
  const initial = player.name[0]?.toUpperCase() ?? '?';
  const color = avatarColor(player.name);
  const baseStyle = {
    ...style,
    '--avatar': color,
    '--accent': color,
    background: color,
    ...(size ? {
      width: size,
      height: size,
      fontSize: `${Math.max(14, Math.round(size * 0.42))}px`,
    } : {}),
  } as React.CSSProperties;

  const selectedAvatar = player.avatarId ? AVATAR_IMAGES[player.avatarId] : undefined;
  const imageSrc = player.photoURL ?? selectedAvatar;

  if (imageSrc) {
    return <img className={`${className} avatar-image`} src={imageSrc} alt={player.name} style={baseStyle} />;
  }

  return (
    <div className={className} style={baseStyle}>
      {initial}
    </div>
  );
}
