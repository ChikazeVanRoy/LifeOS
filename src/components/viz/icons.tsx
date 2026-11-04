import {
  Award, BookCheck, Bookmark, BookMarked, BookOpen, Calendar, CalendarCheck, CheckCheck, Compass, Dumbbell, Feather, FileText,
  Flag, Flame, Heart, Hourglass, Landmark, Languages, Library, MessagesSquare, PenLine, Scale, Shapes, Sparkles, Sprout, Star,
  Sunrise, Target, TrendingUp, Trophy, Mountain, Music, Brain, Code, Palette, Leaf, Bike, Wallet, type LucideIcon, type LucideProps,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  award: Award, "book-check": BookCheck, bookmark: Bookmark, "book-marked": BookMarked, "book-open": BookOpen,
  calendar: Calendar, "calendar-check": CalendarCheck, "check-check": CheckCheck, compass: Compass, dumbbell: Dumbbell,
  feather: Feather, "file-text": FileText, flag: Flag, flame: Flame, heart: Heart, hourglass: Hourglass, landmark: Landmark,
  languages: Languages, library: Library, "messages-square": MessagesSquare, "pen-line": PenLine, scale: Scale, shapes: Shapes,
  sparkles: Sparkles, sprout: Sprout, star: Star, sunrise: Sunrise, target: Target, "trending-up": TrendingUp, trophy: Trophy,
  mountain: Mountain, music: Music, brain: Brain, code: Code, palette: Palette, leaf: Leaf, bike: Bike, wallet: Wallet,
};

export const ICON_CHOICES = ["target", "feather", "languages", "messages-square", "dumbbell", "book-open", "compass", "heart", "sparkles", "landmark", "sunrise", "mountain", "music", "brain", "code", "palette", "leaf", "bike", "wallet", "star"];

/** Icon names live in saved data, so they resolve through this fixed set. */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = ICONS[name] ?? Target;
  return <Cmp {...props} />;
}
