export interface UpdateLogEntry {
  version: string;
  date: string;
  changes: string[];
}

export interface ProjectDetail {
  background: string;
  coreFeatures: string[];
  techSolution: string;
  highlights: string[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  fullDescription: string;
  detail?: ProjectDetail;
  tags: string[];
  coverImage: string;
  techStack: string[];
  liveUrl: string;
  downloadUrl: string;
  demoUrl: string;
  githubUrl: string;
  createdAt: string;
  updateLog: UpdateLogEntry[];
}

export interface TimelineItem {
  id: string;
  year: string;
  title: string;
  description: string;
}

export interface SkillItem {
  name: string;
  label: string;
}

export interface SkillCategory {
  id: string;
  title: string;
  icon: string;
  skills: SkillItem[];
}

export interface SkillWithLevel {
  name: string;
  percentage: number;
}

export interface SkillCategoryWithLevel {
  id: string;
  title: string;
  icon: string;
  skills: SkillWithLevel[];
}

export interface Note {
  slug: string;
  title: string;
  date: string;
  summary: string;
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  url: string;
  category: string;
}

export interface GuestbookMessage {
  id: string;
  nickname: string;
  content: string;
  date: string;
}
