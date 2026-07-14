export interface UpdateLogEntry {
  version: string;
  date: string;
  changes: string[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  fullDescription: string;
  tags: string[];
  coverImage: string;
  techStack: string[];
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
