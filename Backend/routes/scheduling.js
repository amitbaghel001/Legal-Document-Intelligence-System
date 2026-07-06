import express from 'express';
import Case from '../models/Case.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// AI-powered case prioritization algorithm
//
// Case-type urgency sets a priority TIER (baseline score); age and document
// count only break ties within a tier. Previously age alone could add up to
// 50 while an urgent-keyword match only added 40, so a months-old routine
// case would outrank a same-day murder case. Tier gaps here (20/15/15) are
// kept larger than the max combined tie-breaker (12), so a case can never
// climb into the tier above it just by being old or having many documents.
function calculateCasePriority(case_) {
  const daysSinceCreated = (Date.now() - new Date(case_.createdAt)) / (1000 * 60 * 60 * 24);

  const urgentIPCs = ['IPC 302', 'IPC 376', 'IPC 498A', 'murder', 'rape', 'dowry'];
  const hasUrgentIPC = case_.ipcTags?.some(tag =>
    urgentIPCs.some(urgent => tag.toLowerCase().includes(urgent.toLowerCase()))
  ) || case_.title?.toLowerCase().match(/murder|rape|dowry/);

  const hasBailOrCustody = case_.title?.toLowerCase().match(/bail|custody/);
  const hasInterim = case_.title?.toLowerCase().includes('interim');

  let tierBaseline;
  if (hasUrgentIPC) tierBaseline = 70;        // urgent
  else if (hasBailOrCustody) tierBaseline = 55; // high
  else if (hasInterim) tierBaseline = 40;       // medium
  else tierBaseline = 20;                       // low

  const ageBonus = Math.min(daysSinceCreated * 0.3, 8);
  const docsBonus = Math.min((case_.documents?.length || 0), 4);

  return tierBaseline + ageBonus + docsBonus;
}

// Generate AI-suggested schedule
router.get('/auto-schedule', protect, async (req, res) => {
  try {
    const { startDate, days = 7 } = req.query;
    
    // Get unscheduled cases
    const unscheduledCases = await Case.find({
      $or: [
        { scheduledDate: null },
        { scheduledDate: { $exists: false } }
      ],
      status: { $in: ['pending', 'processing'] }
    }).populate('documents');
    
    if (unscheduledCases.length === 0) {
      return res.json({
        totalCases: 0,
        scheduledCases: 0,
        schedule: [],
        unscheduledCount: 0,
        message: 'No unscheduled cases found'
      });
    }
    
    // Calculate priorities for all cases
    const casesWithPriority = unscheduledCases.map(case_ => ({
      case: case_,
      priorityScore: calculateCasePriority(case_)
    })).sort((a, b) => b.priorityScore - a.priorityScore);
    
    // Generate schedule
    const schedule = [];
    const start = startDate ? new Date(startDate) : new Date();
    const courtHours = [
      '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
      '12:00 PM', '12:30 PM', 
      '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
      '04:00 PM', '04:30 PM'
    ];
    
    // Build the date pointer at UTC midnight of the intended calendar day.
    // Using local setHours(0,0,0,0) here previously meant that in timezones
    // ahead of UTC (e.g. IST, +5:30), local midnight serialized to the
    // *previous* day once converted to an ISO string, so schedules always
    // showed one day earlier than intended. Anchoring to UTC avoids that.
    let datePointer = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    let caseIndex = 0;

    for (let day = 0; day < parseInt(days) && caseIndex < casesWithPriority.length; day++) {
      // Skip weekends
      while (datePointer.getUTCDay() === 0 || datePointer.getUTCDay() === 6) {
        datePointer.setUTCDate(datePointer.getUTCDate() + 1);
      }

      courtHours.forEach((time, slotIndex) => {
        if (caseIndex < casesWithPriority.length) {
          const item = casesWithPriority[caseIndex];
          const priorityLevel = item.priorityScore >= 70 ? 'urgent' :
                               item.priorityScore >= 55 ? 'high' :
                               item.priorityScore >= 40 ? 'medium' : 'low';

          schedule.push({
            caseId: item.case._id,
            caseNumber: item.case.caseNumber,
            title: item.case.title,
            date: new Date(datePointer),
            time: time,
            courtRoom: `Court ${(slotIndex % 4) + 1}`,
            priority: priorityLevel,
            estimatedDuration: 30,
            priorityScore: item.priorityScore.toFixed(1)
          });
          caseIndex++;
        }
      });

      datePointer.setUTCDate(datePointer.getUTCDate() + 1);
    }
    
    res.json({
      totalCases: casesWithPriority.length,
      scheduledCases: schedule.length,
      schedule,
      unscheduledCount: Math.max(0, casesWithPriority.length - schedule.length)
    });
  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Apply schedule to cases
router.post('/apply-schedule', protect, async (req, res) => {
  try {
    const { schedule } = req.body;
    
    if (!schedule || schedule.length === 0) {
      return res.status(400).json({ error: 'No schedule provided' });
    }
    
    const updates = [];
    for (const item of schedule) {
      const updated = await Case.findByIdAndUpdate(
        item.caseId,
        {
          scheduledDate: item.date,
          scheduledTime: item.time,
          courtRoom: item.courtRoom,
          priority: item.priority,
          estimatedDuration: item.estimatedDuration,
          assignedJudge: req.user._id,
          status: 'scheduled'
        },
        { new: true }
      );
      
      if (updated) {
        updates.push(updated);
      }
    }
    
    res.json({
      success: true,
      message: `Successfully scheduled ${updates.length} cases`,
      scheduledCases: updates
    });
  } catch (error) {
    console.error('Error applying schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get judge's schedule (calendar view)
router.get('/my-schedule', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    const query = {
      assignedJudge: req.user._id,
      scheduledDate: {
        $gte: start,
        $lte: end
      }
    };
    
    const schedule = await Case.find(query)
      .sort({ scheduledDate: 1, scheduledTime: 1 })
      .select('caseNumber title scheduledDate scheduledTime courtRoom priority status ipcTags');
    
    // Group by date
    const groupedSchedule = {};
    schedule.forEach(case_ => {
      const dateKey = case_.scheduledDate.toISOString().split('T')[0];
      if (!groupedSchedule[dateKey]) {
        groupedSchedule[dateKey] = [];
      }
      groupedSchedule[dateKey].push(case_);
    });
    
    res.json({
      schedule: groupedSchedule,
      totalScheduled: schedule.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reschedule a case
router.put('/reschedule/:caseId', protect, async (req, res) => {
  try {
    const { scheduledDate, scheduledTime, courtRoom, reason } = req.body;
    
    const case_ = await Case.findById(req.params.caseId);
    
    if (!case_) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    // Store previous hearing
    if (case_.scheduledDate) {
      if (!case_.previousHearings) {
        case_.previousHearings = [];
      }
      case_.previousHearings.push({
        date: case_.scheduledDate,
        notes: reason || 'Rescheduled',
        duration: case_.estimatedDuration || 30
      });
    }
    
    case_.scheduledDate = scheduledDate;
    case_.scheduledTime = scheduledTime;
    case_.courtRoom = courtRoom;
    case_.updatedAt = Date.now();
    
    await case_.save();
    
    res.json({
      success: true,
      message: 'Case rescheduled successfully',
      case: case_
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
