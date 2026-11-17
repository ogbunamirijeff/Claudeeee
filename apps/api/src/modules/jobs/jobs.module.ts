import { Module } from '@nestjs/common';
import { AdminJobsController } from '../admin/admin-jobs.controller';
import { ArtisanController } from '../artisan/artisan.controller';
import { AssignmentsService } from '../assignments/assignments.service';
import { OfferExpiryScheduler } from '../assignments/offer-expiry.scheduler';
import { FilesController } from '../files/files.controller';
import { FilesService } from '../files/files.service';
import { MessagesController } from '../messages/messages.controller';
import { MessagesService } from '../messages/messages.service';
import { QuotesController } from '../quotes/quotes.controller';
import { QuotesService } from '../quotes/quotes.service';
import { JobAccessService } from './job-access.service';
import { JobTransitionsService } from './job-transitions.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/** Phase 2 marketplace core: requests, offers, quotes, files and chat. */
@Module({
  controllers: [
    JobsController,
    QuotesController,
    ArtisanController,
    AdminJobsController,
    FilesController,
    MessagesController,
  ],
  providers: [
    JobsService,
    JobAccessService,
    JobTransitionsService,
    AssignmentsService,
    OfferExpiryScheduler,
    QuotesService,
    FilesService,
    MessagesService,
  ],
  exports: [JobTransitionsService, JobAccessService, FilesService, AssignmentsService],
})
export class JobsModule {}
