import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Clock, TrendingUp, Target, Code, Lightbulb } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CodingTask {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'bug' | 'feature' | 'refactor' | 'optimization' | 'documentation';
  estimatedTime: string;
  difficulty: 'easy' | 'medium' | 'hard';
  dependencies: string[];
  solution: {
    approach: string;
    steps: string[];
    code: string;
    explanation: string;
  };
  status: 'pending' | 'in-progress' | 'completed';
}

interface WorkspaceInsight {
  type: 'health' | 'productivity' | 'risk' | 'opportunity';
  title: string;
  description: string;
  tasks: CodingTask[];
  priority: 'high' | 'medium' | 'low';
}

const SAMPLE_INSIGHTS: WorkspaceInsight[] = [
  {
    type: 'health',
    title: 'Project Health Issues',
    description: 'Address critical health issues to prevent future blockers',
    priority: 'high',
    tasks: [
      {
        id: 'fix-test-coverage',
        title: 'Improve Test Coverage',
        description: 'Add comprehensive tests to experimental-ml project',
        priority: 'high',
        category: 'refactor',
        estimatedTime: '2-3 hours',
        difficulty: 'medium',
        dependencies: ['jest', 'testing-library'],
        solution: {
          approach: 'Add unit and integration tests to improve code reliability',
          steps: [
            'Install testing dependencies',
            'Create test directory structure',
            'Write unit tests for core functions',
            'Add integration tests for API endpoints',
            'Configure test coverage reporting'
          ],
          code: `// Example test structure
describe('ML Model', () => {
  test('should process input correctly', () => {
    const input = [1, 2, 3, 4, 5];
    const result = processInput(input);
    expect(result).toBeDefined();
  });
});`,
          explanation: 'Testing ensures code reliability and prevents regressions during future changes.'
        },
        status: 'pending'
      }
    ]
  },
  {
    type: 'productivity',
    title: 'Productivity Optimization',
    description: 'Streamline development workflow for better velocity',
    priority: 'medium',
    tasks: [
      {
        id: 'setup-ci-cd',
        title: 'Implement CI/CD Pipeline',
        description: 'Add automated testing and deployment pipeline',
        priority: 'medium',
        category: 'feature',
        estimatedTime: '4-6 hours',
        difficulty: 'hard',
        dependencies: ['github-actions', 'docker'],
        solution: {
          approach: 'Automate the build, test, and deployment process',
          steps: [
            'Create GitHub Actions workflow',
            'Configure automated testing',
            'Set up deployment to staging',
            'Add production deployment pipeline',
            'Configure monitoring and alerts'
          ],
          code: `# .github/workflows/ci.yml
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test`,
          explanation: 'CI/CD automation reduces manual work and ensures consistent quality.'
        },
        status: 'pending'
      }
    ]
  },
  {
    type: 'risk',
    title: 'Security & Risk Mitigation',
    description: 'Address security vulnerabilities and technical debt',
    priority: 'high',
    tasks: [
      {
        id: 'update-dependencies',
        title: 'Update Vulnerable Dependencies',
        description: 'Update lodash and request packages to secure versions',
        priority: 'high',
        category: 'optimization',
        estimatedTime: '1-2 hours',
        difficulty: 'easy',
        dependencies: ['npm-audit'],
        solution: {
          approach: 'Update dependencies to latest secure versions',
          steps: [
            'Run npm audit to identify vulnerabilities',
            'Update package.json with secure versions',
            'Test application functionality',
            'Run security tests',
            'Deploy updated version'
          ],
          code: `# Update dependencies
npm audit fix

# Or manually update
npm install lodash@latest
npm install --save-dev jest@latest`,
          explanation: 'Keeping dependencies updated prevents security vulnerabilities.'
        },
        status: 'pending'
      }
    ]
  },
  {
    type: 'opportunity',
    title: 'Innovation Opportunities',
    description: 'Leverage healthy projects for new features and improvements',
    priority: 'low',
    tasks: [
      {
        id: 'add-monitoring',
        title: 'Add Application Monitoring',
        description: 'Implement logging and performance monitoring',
        priority: 'low',
        category: 'feature',
        estimatedTime: '3-4 hours',
        difficulty: 'medium',
        dependencies: ['winston', 'prometheus'],
        solution: {
          approach: 'Add comprehensive monitoring for better observability',
          steps: [
            'Install monitoring libraries',
            'Configure logging middleware',
            'Add performance metrics',
            'Set up error tracking',
            'Create monitoring dashboard'
          ],
          code: `// Add logging
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});`,
          explanation: 'Monitoring provides insights into application performance and issues.'
        },
        status: 'pending'
      }
    ]
  }
];

function App() {
  const [insights, setInsights] = useState<WorkspaceInsight[]>(SAMPLE_INSIGHTS);
  const [selectedTask, setSelectedTask] = useState<CodingTask | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const filteredInsights = insights.filter(insight =>
    insight.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    insight.tasks.some(task =>
      task.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <AlertCircle className="h-4 w-4" />;
      case 'medium': return <Clock className="h-4 w-4" />;
      case 'low': return <CheckCircle className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bug': return '🐛';
      case 'feature': return '✨';
      case 'refactor': return '🔄';
      case 'optimization': return '⚡';
      case 'documentation': return '📚';
      default: return '💻';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Glimpse Coding Assistant</h1>
          <p className="text-lg text-muted-foreground">
            AI-powered coding task solutions based on workspace intelligence
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Search tasks, projects, or solutions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Workspace Overview</TabsTrigger>
            <TabsTrigger value="tasks">Coding Tasks</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Workspace Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Workspace Intelligence Summary
                </CardTitle>
                <CardDescription>
                  Real-time analysis of your development workspace
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">4</div>
                    <div className="text-sm text-muted-foreground">Active Projects</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">1</div>
                    <div className="text-sm text-muted-foreground">Needs Attention</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">78</div>
                    <div className="text-sm text-muted-foreground">Avg Health Score</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Insights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredInsights.map((insight, index) => (
                <Card key={index} className="relative">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        {getPriorityIcon(insight.priority)}
                        {insight.title}
                      </CardTitle>
                      <Badge variant={getPriorityColor(insight.priority)}>
                        {insight.priority}
                      </Badge>
                    </div>
                    <CardDescription>{insight.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {insight.tasks.map((task) => (
                        <div key={task.id} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex items-center gap-2">
                            <span>{getCategoryIcon(task.category)}</span>
                            <span className="font-medium">{task.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{task.estimatedTime}</Badge>
                            <Button
                              size="sm"
                              onClick={() => setSelectedTask(task)}
                            >
                              View Solution
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-6">
            {/* Task List */}
            <div className="grid gap-4">
              {filteredInsights.flatMap(insight => insight.tasks).map((task) => (
                <Card key={task.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{getCategoryIcon(task.category)}</span>
                          <h3 className="text-lg font-semibold">{task.title}</h3>
                          <Badge variant={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Badge>
                          <Badge variant="outline">{task.difficulty}</Badge>
                        </div>
                        <p className="text-muted-foreground mb-3">{task.description}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>⏱️ {task.estimatedTime}</span>
                          <span>📋 {task.dependencies.length} dependencies</span>
                        </div>
                      </div>
                      <Button onClick={() => setSelectedTask(task)}>
                        <Lightbulb className="h-4 w-4 mr-2" />
                        Get Solution
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Task Solution Modal */}
        {selectedTask && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Code className="h-6 w-6" />
                    {selectedTask.title}
                  </h2>
                  <Button variant="outline" onClick={() => setSelectedTask(null)}>
                    Close
                  </Button>
                </div>

                <div className="space-y-6">
                  <Alert>
                    <Target className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Approach:</strong> {selectedTask.solution.approach}
                    </AlertDescription>
                  </Alert>

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Implementation Steps</h3>
                    <ol className="list-decimal list-inside space-y-2">
                      {selectedTask.solution.steps.map((step, index) => (
                        <li key={index} className="text-muted-foreground">{step}</li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Code Solution</h3>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                      <code>{selectedTask.solution.code}</code>
                    </pre>
                  </div>

                  <Alert>
                    <Lightbulb className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Why this solution:</strong> {selectedTask.solution.explanation}
                    </AlertDescription>
                  </Alert>

                  <div className="flex items-center gap-4">
                    <Badge variant="outline">
                      Difficulty: {selectedTask.difficulty}
                    </Badge>
                    <Badge variant="outline">
                      Time: {selectedTask.estimatedTime}
                    </Badge>
                    {selectedTask.dependencies.length > 0 && (
                      <Badge variant="outline">
                        Dependencies: {selectedTask.dependencies.join(', ')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
