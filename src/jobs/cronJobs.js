import cron from 'node-cron';
import { BulkEmailService } from '../services/BulkEmailService.js';

export const startCronJobs = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      // console.log('Running scheduled bulk email dispatcher...');
      await BulkEmailService.dispatchDueCampaigns();
    } catch (error) {
      console.error('Error dispatching due campaigns:', error);
    }
  });

  console.log('Cron jobs initialized');
};
