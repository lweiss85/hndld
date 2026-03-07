import { hndldIcons, type HndldIconName, type HndldIconProps } from "./hndld-icons";

interface IconProps extends HndldIconProps {
  name: HndldIconName;
}

export function Icon({ name, ...props }: IconProps) {
  const IconComponent = hndldIcons[name];
  return <IconComponent {...props} />;
}
